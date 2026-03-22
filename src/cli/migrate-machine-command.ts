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
 * Writes one prepared artifact atomically using a temporary file and rename.
 *
 * @param rewrite - Prepared artifact rewrite
 */
async function writePreparedArtifact(
	rewrite: PreparedArtifactRewrite,
): Promise<void> {
	const tempPath = `${rewrite.artifactPath}.${process.pid}.${Date.now()}.tmp`;
	try {
		await fs.writeFile(tempPath, rewrite.nextContent, "utf-8");
		await fs.rename(tempPath, rewrite.artifactPath);
	} catch (error) {
		try {
			await fs.unlink(tempPath);
		} catch {
			// Best-effort cleanup only.
		}
		throw error;
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
		if (preparedPlan?.changed) {
			await writePreparedArtifact(preparedPlan);
			planFilesUpdated++;
		}
		if (preparedRun?.changed) {
			await writePreparedArtifact(preparedRun);
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
		const resultsDir = path.resolve(options.dir);

		try {
			if (options.rebuildDashboardIndex && !options.dashboardOutputDir) {
				throw new Error(
					"--rebuild-dashboard-index requires --dashboard-output-dir to avoid mutating the source results directory",
				);
			}
			const migrated = await migrateResultsDirectory(resultsDir);
			logger.info(
				{ resultsDir, ...migrated },
				"Migrated machine-profile artifacts",
			);

			if (options.rebuildDashboardIndex) {
				const dashboardOutputDir = path.resolve(options.dashboardOutputDir);
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
