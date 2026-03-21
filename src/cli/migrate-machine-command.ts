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
	migrateLegacyPlanPayload,
	migrateLegacyRunPayload,
} from "../lib/machine-profile/legacy.js";
import { logger } from "../lib/logger.js";
import { RunPlanSchema, RunResultSchema } from "../schemas/index.js";

/**
 * Rewrites one JSON artifact after applying a migration function.
 *
 * @param artifactPath - Absolute artifact path
 * @param migrate - Migration function
 * @param validate - Schema validation callback
 * @returns True when the file changed on disk
 */
async function rewriteArtifact(
	artifactPath: string,
	migrate: (raw: unknown) => unknown,
	validate: (raw: unknown) => unknown,
): Promise<boolean> {
	const original = await fs.readFile(artifactPath, "utf-8");
	const migrated = validate(migrate(JSON.parse(original) as unknown));
	const nextContent = `${JSON.stringify(migrated, null, 2)}\n`;
	if (original === nextContent) {
		return false;
	}
	await fs.writeFile(artifactPath, nextContent, "utf-8");
	return true;
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

		try {
			if (
				await rewriteArtifact(runPath, migrateLegacyRunPayload, (raw) =>
					RunResultSchema.parse(raw),
				)
			) {
				runFilesUpdated++;
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
			// Missing run.json is ignored.
		}

		try {
			if (
				await rewriteArtifact(planPath, migrateLegacyPlanPayload, (raw) =>
					RunPlanSchema.parse(raw),
				)
			) {
				planFilesUpdated++;
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
			// Missing plan.json is ignored.
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
		"Output directory for rebuilt dashboard artifacts (defaults to --dir)",
	)
	.action(async (options) => {
		const resultsDir = path.resolve(options.dir);
		const dashboardOutputDir = path.resolve(
			options.dashboardOutputDir ?? resultsDir,
		);

		try {
			const migrated = await migrateResultsDirectory(resultsDir);
			logger.info(
				{ resultsDir, ...migrated },
				"Migrated machine-profile artifacts",
			);

			if (options.rebuildDashboardIndex) {
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
