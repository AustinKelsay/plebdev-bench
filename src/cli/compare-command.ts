/**
 * Purpose: `bench compare` command wiring for comparing two benchmark runs.
 * Exports: compareCommand
 *
 * Reads two run.json files, validates checkpoint compatibility, delegates
 * comparison to result helpers, and prints terminal-native output.
 *
 * Invariants:
 * - Checkpoint mismatches are user-facing validation messages in CLI flow.
 * - Invalid run or plan artifacts still fail the command.
 */

import { Command } from "commander";
import { z } from "zod";
import { compareRuns } from "../results/compare.js";
import { findRunDir, readResult } from "../results/reader.js";
import {
	printExclusiveItems,
	printHeader,
	printImprovements,
	printRegressions,
	printScoringDeltas,
	printSummary,
} from "./compare-formatters.js";
import {
	getCheckpointGuardMessage,
	readPlanBestEffort,
	resolveCheckpointId,
} from "./compare-utils.js";

/** Default output directory for results. */
const DEFAULT_OUTPUT_DIR = "results";

const RunCompareSchema = z.object({
	runA: z.string().trim().min(1),
	runB: z.string().trim().min(1),
	options: z.object({
		output: z.string().trim().min(1),
		json: z.boolean().default(false),
		allowCrossCheckpoint: z.boolean().default(false),
	}),
});

/** CLI compare command. */
export const compareCommand = new Command("compare")
	.description("Compare two benchmark runs")
	.argument("<run-a>", "First run ID or path (baseline)")
	.argument("<run-b>", "Second run ID or path (comparison)")
	.option(
		"-o, --output <dir>",
		"Output directory for results",
		DEFAULT_OUTPUT_DIR,
	)
	.option(
		"--allow-cross-checkpoint",
		"Allow comparisons when benchmark checkpoint metadata is missing or mismatched",
		false,
	)
	.option("--json", "Output raw JSON instead of formatted table")
	.action(
		async (
			runA: string,
			runB: string,
			options: {
				output: string;
				json?: boolean;
				allowCrossCheckpoint?: boolean;
			},
		) => {
			try {
				const parsed = RunCompareSchema.parse({ runA, runB, options });
				const dirA = findRunDir(parsed.options.output, parsed.runA);
				const resultA = readResult(dirA);
				const planA = readPlanBestEffort(dirA);

				const dirB = findRunDir(parsed.options.output, parsed.runB);
				const resultB = readResult(dirB);
				const planB = readPlanBestEffort(dirB);

				const checkpointA = resolveCheckpointId(resultA, planA);
				const checkpointB = resolveCheckpointId(resultB, planB);
				const allowCrossCheckpoint = parsed.options.allowCrossCheckpoint;
				const checkpointGuardMessage = getCheckpointGuardMessage(
					checkpointA,
					checkpointB,
					allowCrossCheckpoint,
				);
				if (checkpointGuardMessage) {
					console.error(`✗ FAIL: ${checkpointGuardMessage}`);
					process.exit(1);
				}

				const comparison = compareRuns(resultA, resultB);

				if (parsed.options.json) {
					console.log(JSON.stringify(comparison, null, 2));
					return;
				}

				printHeader(comparison);
				printSummary(comparison);
				printRegressions(comparison);
				printImprovements(comparison);
				printScoringDeltas(comparison);
				printExclusiveItems(comparison);
			} catch (error) {
				console.error(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exit(1);
			}
		},
	);
