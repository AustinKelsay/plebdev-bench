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
import {
	normalizeKnownPlanPayload,
	normalizeKnownRunPayload,
} from "../lib/machine-profile/legacy.js";
import { logger } from "../lib/logger.js";
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

	const normalized = normalize(JSON.parse(original) as unknown);
	validate(normalized);
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
		}),
	);

	try {
		for (const rewrite of stagedRewrites) {
			await fs.writeFile(rewrite.tempPath, rewrite.nextContent, "utf-8");
			await fs.copyFile(rewrite.artifactPath, rewrite.backupPath);
		}
		for (const rewrite of stagedRewrites) {
			await fs.rename(rewrite.tempPath, rewrite.artifactPath);
		}
	} catch (error) {
		for (const rewrite of stagedRewrites) {
			try {
				await fs.copyFile(rewrite.backupPath, rewrite.artifactPath);
			} catch {
				// Best-effort rollback only.
			}
		}
		throw error;
	} finally {
		for (const rewrite of stagedRewrites) {
			try {
				await fs.unlink(rewrite.tempPath);
			} catch {
				// Best-effort cleanup only.
			}
			try {
				await fs.unlink(rewrite.backupPath);
			} catch {
				// Best-effort cleanup only.
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
	.description("Rewrite run artifacts to the standardized machine-profile schema")
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
		try {
			const parsedOptions = MigrateMachineCommandOptionsSchema.parse(options);
			const resultsDir = path.resolve(parsedOptions.dir);
			const migrated = await migrateResultsDirectory(resultsDir);
			logger.info(
				{ resultsDir, ...migrated },
				"Migrated machine-profile artifacts",
			);

			if (parsedOptions.rebuildDashboardIndex) {
				const dashboardOutputDirInput = parsedOptions.dashboardOutputDir;
				if (dashboardOutputDirInput === undefined) {
					throw new Error(
						"--rebuild-dashboard-index requires --dashboard-output-dir to avoid mutating the source results directory",
					);
				}
				const dashboardOutputDir = path.resolve(dashboardOutputDirInput);
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
			console.error(
				error instanceof Error ? error.message : String(error),
			);
			logger.error({ error }, "Machine-profile migration failed");
			process.exit(1);
		}
	});
