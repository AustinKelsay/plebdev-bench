/**
 * Purpose: Migrate stored run artifacts to the standardized machine-profile schema.
 * Exports: migrateMachineCommand
 *
 * Invariants:
 * - Only rewrites `plan.json` / `run.json` after successful migration + validation
 * - Can optionally rebuild published dashboard index artifacts after rewriting
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { z } from "zod";
import { buildDashboardIndexArtifacts } from "../../apps/dashboard/scripts/build-index.js";
import { logger } from "../lib/logger.js";
import {
	normalizeKnownPlanPayload,
	normalizeKnownRunPayload,
} from "../lib/machine-profile/legacy.js";
import { RunPlanSchema, RunResultSchema } from "../schemas/index.js";

/**
 * Prepared rewrite state for one artifact file.
 */
interface PreparedArtifactRewrite {
	artifactPath: string;
	nextContent: string;
	changed: boolean;
}

/**
 * Staged rewrite paths used for multi-file replacement with rollback.
 */
interface StagedArtifactRewrite extends PreparedArtifactRewrite {
	tempPath: string;
	backupPath: string;
	tempWritten: boolean;
	backupCreated: boolean;
	renameCompleted: boolean;
	rollbackSucceeded: boolean;
}

/** Returns true when `candidate` equals or is nested beneath `basePath`. */
function isSameOrNestedPath(basePath: string, candidate: string): boolean {
	if (basePath === candidate) {
		return true;
	}
	const normalizedBase = basePath.endsWith(path.sep)
		? basePath
		: `${basePath}${path.sep}`;
	return candidate.startsWith(normalizedBase);
}

const MigrateMachineCommandOptionsSchema = z
	.object({
		dir: z.string().min(1),
		rebuildDashboardIndex: z.boolean(),
		dashboardOutputDir: z.string().min(1).optional(),
	})
	.superRefine((options, context) => {
		if (
			options.rebuildDashboardIndex &&
			options.dashboardOutputDir === undefined
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["dashboardOutputDir"],
				message:
					"--rebuild-dashboard-index requires --dashboard-output-dir to avoid mutating the source results directory",
			});
		}
		if (
			options.rebuildDashboardIndex &&
			options.dashboardOutputDir !== undefined
		) {
			const sourceDir = path.normalize(path.resolve(options.dir));
			const dashboardOutputDir = path.normalize(
				path.resolve(options.dashboardOutputDir),
			);
			if (
				isSameOrNestedPath(sourceDir, dashboardOutputDir) ||
				isSameOrNestedPath(dashboardOutputDir, sourceDir)
			) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["dashboardOutputDir"],
					message:
						"--rebuild-dashboard-index requires --dashboard-output-dir to avoid mutating the source results directory",
				});
			}
		}
	});

/**
 * Loads and validates one JSON artifact rewrite without touching the filesystem.
 *
 * @param artifactPath - Absolute artifact path
 * @param normalize - Version-aware normalization function
 * @param validate - Schema validation callback
 * @returns Prepared rewrite or undefined when the file is missing
 */
async function prepareArtifactRewrite(
	artifactPath: string,
	normalize: (raw: unknown) => unknown,
	validate: (raw: unknown) => void,
): Promise<PreparedArtifactRewrite | undefined> {
	let original: string;
	try {
		original = await fs.readFile(artifactPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(original) as unknown;
	} catch (error) {
		throw new Error(
			`Invalid JSON in artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}

	let normalized: unknown;
	try {
		normalized = normalize(parsed);
	} catch (error) {
		throw new Error(
			`Failed to normalize migrated artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	try {
		validate(normalized);
	} catch (error) {
		throw new Error(
			`Invalid migrated artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	const nextContent = `${JSON.stringify(normalized, null, 2)}\n`;
	return {
		artifactPath,
		nextContent,
		changed: original !== nextContent,
	};
}

/**
 * Applies one or more prepared artifact rewrites with rollback if a later rename fails.
 *
 * @param rewrites - Prepared artifact rewrites for one run directory
 */
async function writePreparedArtifacts(
	rewrites: PreparedArtifactRewrite[],
): Promise<void> {
	const changedRewrites = rewrites.filter((rewrite) => rewrite.changed);
	if (changedRewrites.length === 0) {
		return;
	}

	const token = `${process.pid}.${Date.now()}`;
	const stagedRewrites: StagedArtifactRewrite[] = changedRewrites.map(
		(rewrite, index) => ({
			...rewrite,
			tempPath: `${rewrite.artifactPath}.${token}.${index}.tmp`,
			backupPath: `${rewrite.artifactPath}.${token}.${index}.bak`,
			tempWritten: false,
			backupCreated: false,
			renameCompleted: false,
			rollbackSucceeded: false,
		}),
	);
	let writeCommitted = false;

	try {
		for (const rewrite of stagedRewrites) {
			try {
				await fs.writeFile(rewrite.tempPath, rewrite.nextContent, "utf-8");
				rewrite.tempWritten = true;
			} catch (error) {
				throw new Error(
					`Failed to stage migrated artifact for ${rewrite.artifactPath}: ${(error as Error).message}`,
				);
			}
			try {
				await fs.copyFile(rewrite.artifactPath, rewrite.backupPath);
				rewrite.backupCreated = true;
			} catch (error) {
				throw new Error(
					`Failed to create rollback backup for ${rewrite.artifactPath}: ${(error as Error).message}`,
				);
			}
		}
		for (const rewrite of stagedRewrites) {
			try {
				await fs.rename(rewrite.tempPath, rewrite.artifactPath);
				rewrite.renameCompleted = true;
			} catch (error) {
				throw new Error(
					`Failed to replace artifact with migrated content for ${rewrite.artifactPath}: ${(error as Error).message}`,
				);
			}
		}
		writeCommitted = true;
	} catch (error) {
		for (const rewrite of stagedRewrites) {
			if (!rewrite.backupCreated || !rewrite.renameCompleted) {
				continue;
			}
			try {
				await fs.copyFile(rewrite.backupPath, rewrite.artifactPath);
				rewrite.rollbackSucceeded = true;
			} catch (rollbackError) {
				logger.warn(
					{
						artifactPath: rewrite.artifactPath,
						error: rollbackError,
					},
					"Failed to restore artifact backup during migration rollback",
				);
			}
		}
		throw error;
	} finally {
		for (const rewrite of stagedRewrites) {
			if (rewrite.tempWritten && !rewrite.renameCompleted) {
				try {
					await fs.unlink(rewrite.tempPath);
				} catch (cleanupError) {
					logger.warn(
						{
							artifactPath: rewrite.artifactPath,
							path: rewrite.tempPath,
							error: cleanupError,
						},
						"Failed to remove staged migration temp file",
					);
				}
			}
			const shouldDeleteBackup =
				rewrite.backupCreated &&
				(writeCommitted ||
					rewrite.rollbackSucceeded ||
					!rewrite.renameCompleted);
			if (shouldDeleteBackup) {
				try {
					await fs.unlink(rewrite.backupPath);
				} catch (cleanupError) {
					logger.warn(
						{
							artifactPath: rewrite.artifactPath,
							path: rewrite.backupPath,
							error: cleanupError,
						},
						"Failed to remove migration backup file",
					);
				}
			}
		}
	}
}

/**
 * Rewrites all run artifacts found under a results directory.
 *
 * @param resultsDir - Results directory
 * @returns Rewrite counts
 */
async function migrateResultsDirectory(resultsDir: string): Promise<{
	runFilesUpdated: number;
	planFilesUpdated: number;
}> {
	const entries = await fs.readdir(resultsDir, { withFileTypes: true });
	let runFilesUpdated = 0;
	let planFilesUpdated = 0;

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const runDir = path.join(resultsDir, entry.name);
		const runPath = path.join(runDir, "run.json");
		const planPath = path.join(runDir, "plan.json");
		const preparedRun = await prepareArtifactRewrite(
			runPath,
			normalizeKnownRunPayload,
			(raw) => {
				RunResultSchema.parse(raw);
			},
		);
		const preparedPlan = await prepareArtifactRewrite(
			planPath,
			normalizeKnownPlanPayload,
			(raw) => {
				RunPlanSchema.parse(raw);
			},
		);

		// Validate both siblings before writing either file so a bad plan cannot
		// leave a successfully rewritten run paired with an invalid companion.
		await writePreparedArtifacts(
			[preparedPlan, preparedRun].filter(
				(rewrite): rewrite is PreparedArtifactRewrite => rewrite !== undefined,
			),
		);
		if (preparedPlan?.changed) {
			planFilesUpdated++;
		}
		if (preparedRun?.changed) {
			runFilesUpdated++;
		}
	}

	return { runFilesUpdated, planFilesUpdated };
}

/** CLI command for machine-profile artifact migration. */
export const migrateMachineCommand = new Command("migrate-machine-profiles")
	.description(
		"Rewrite run artifacts to the standardized machine-profile schema",
	)
	.option("-d, --dir <path>", "Results directory to rewrite", "results")
	.option(
		"--rebuild-dashboard-index",
		"Rebuild dashboard index/aggregate artifacts after migration",
		false,
	)
	.option(
		"--dashboard-output-dir <path>",
		"Output directory for rebuilt dashboard artifacts",
	)
	.action(async (options) => {
		const parsedOptions = MigrateMachineCommandOptionsSchema.safeParse(options);
		if (!parsedOptions.success) {
			logger.warn(
				{ issues: parsedOptions.error.issues },
				"Machine-profile migration options failed validation",
			);
			return;
		}

		try {
			const resultsDir = path.resolve(parsedOptions.data.dir);
			const migrated = await migrateResultsDirectory(resultsDir);
			logger.info(
				{ resultsDir, ...migrated },
				"Migrated machine-profile artifacts",
			);

			if (parsedOptions.data.rebuildDashboardIndex) {
				const dashboardOutputDir = path.resolve(
					parsedOptions.data.dashboardOutputDir!,
				);
				const result = await buildDashboardIndexArtifacts({
					sourceResultsDir: resultsDir,
					outputResultsDir: dashboardOutputDir,
				});
				logger.info(
					{
						outputResultsDir: dashboardOutputDir,
						aggregatesWritten: result.aggregatesWritten,
						latestCheckpointId: result.index.latestCheckpointId,
					},
					"Rebuilt dashboard index artifacts",
				);
			}
		} catch (error) {
			logger.error({ error }, "Machine-profile migration failed");
			process.exit(1);
		}
	});
