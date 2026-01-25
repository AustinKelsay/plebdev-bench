/**
 * Purpose: `bench compare` command for comparing two benchmark runs.
 * Exports: compareCommand
 *
 * Reads two run.json files, computes deltas, and prints a terminal-native
 * diff table with status changes, score changes, and duration changes.
 */

import { Command } from "commander";
import { findRunDir, readResult } from "../results/reader.js";
import { compareRuns, formatDelta, type CompareResult, type MatchedItem } from "../results/compare.js";

/** Default output directory for results. */
const DEFAULT_OUTPUT_DIR = "results";

/**
 * Truncates a string to max length with ellipsis.
 */
function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen - 1) + "…";
}

/**
 * Pads a string to a fixed width.
 */
function pad(str: string, width: number, align: "left" | "right" = "left"): string {
	if (align === "right") {
		return str.padStart(width);
	}
	return str.padEnd(width);
}

/**
 * Formats a timestamp for display.
 */
function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleString("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/**
 * Prints the header section with run info.
 */
function printHeader(result: CompareResult): void {
	console.log("");
	console.log("Compare Benchmark Runs");
	console.log("=".repeat(60));
	console.log(`Run A: ${result.runA.runId} (${formatTimestamp(result.runA.timestamp)})`);
	console.log(`Run B: ${result.runB.runId} (${formatTimestamp(result.runB.timestamp)})`);
	console.log("");
}

/**
 * Prints the summary section.
 */
function printSummary(result: CompareResult): void {
	const { summary } = result;

	console.log("Summary");
	console.log("-".repeat(40));
	console.log(`  Matched items:  ${summary.totalMatched}`);
	console.log(`  Only in A:      ${summary.totalOnlyInA}`);
	console.log(`  Only in B:      ${summary.totalOnlyInB}`);
	console.log("");

	if (summary.statusChanges.improved > 0 || summary.statusChanges.regressed > 0) {
		console.log("Status Changes");
		console.log("-".repeat(40));
		if (summary.statusChanges.improved > 0) {
			console.log(`  Improved:   ${summary.statusChanges.improved} (failed → completed)`);
		}
		if (summary.statusChanges.regressed > 0) {
			console.log(`  Regressed:  ${summary.statusChanges.regressed} (completed → failed)`);
		}
		console.log("");
	}

	if (summary.scoringDelta) {
		console.log("Scoring Delta");
		console.log("-".repeat(40));
		console.log(`  Pass rate:  ${formatDelta(summary.scoringDelta.passRateDelta, "%")}`);
		console.log("");
	}

	if (summary.frontierEvalDelta) {
		console.log("Frontier Eval Delta");
		console.log("-".repeat(40));
		console.log(`  Avg score:  ${formatDelta(summary.frontierEvalDelta.avgScoreDelta, "/10")}`);
		console.log("");
	}
}

/**
 * Prints regression details table.
 */
function printRegressions(result: CompareResult): void {
	const regressions = result.matched.filter(
		(m) => m.deltas.status?.a === "completed" && m.deltas.status?.b === "failed",
	);

	if (regressions.length === 0) return;

	console.log("Regressions (completed → failed)");
	console.log("-".repeat(60));

	// Table header
	const modelW = 20;
	const harnessW = 10;
	const testW = 20;
	const passW = 8;

	console.log(
		`${pad("MODEL", modelW)} ${pad("HARNESS", harnessW)} ${pad("TEST", testW)} ${pad("PASS", passW)}`,
	);

	for (const item of regressions) {
		console.log(
			`${pad(truncate(item.model, modelW), modelW)} ` +
			`${pad(item.harness, harnessW)} ` +
			`${pad(truncate(item.test, testW), testW)} ` +
			`${pad(item.passType, passW)}`,
		);
	}
	console.log("");
}

/**
 * Prints improvement details table.
 */
function printImprovements(result: CompareResult): void {
	const improvements = result.matched.filter(
		(m) => m.deltas.status?.a === "failed" && m.deltas.status?.b === "completed",
	);

	if (improvements.length === 0) return;

	console.log("Improvements (failed → completed)");
	console.log("-".repeat(60));

	// Table header
	const modelW = 20;
	const harnessW = 10;
	const testW = 20;
	const passW = 8;

	console.log(
		`${pad("MODEL", modelW)} ${pad("HARNESS", harnessW)} ${pad("TEST", testW)} ${pad("PASS", passW)}`,
	);

	for (const item of improvements) {
		console.log(
			`${pad(truncate(item.model, modelW), modelW)} ` +
			`${pad(item.harness, harnessW)} ` +
			`${pad(truncate(item.test, testW), testW)} ` +
			`${pad(item.passType, passW)}`,
		);
	}
	console.log("");
}

/**
 * Prints scoring delta table for items with significant changes.
 */
function printScoringDeltas(result: CompareResult): void {
	const withScoreDeltas = result.matched.filter(
		(m) =>
			m.deltas.automatedScore &&
			Math.abs(m.deltas.automatedScore.passRateDelta) >= 1, // At least 1% change
	);

	if (withScoreDeltas.length === 0) return;

	// Sort by pass rate delta (most regressed first)
	withScoreDeltas.sort(
		(a, b) =>
			(a.deltas.automatedScore?.passRateDelta ?? 0) -
			(b.deltas.automatedScore?.passRateDelta ?? 0),
	);

	console.log("Scoring Deltas (≥1% change)");
	console.log("-".repeat(70));

	const modelW = 18;
	const harnessW = 8;
	const testW = 18;
	const passW = 8;
	const deltaW = 12;

	console.log(
		`${pad("MODEL", modelW)} ${pad("HARNESS", harnessW)} ${pad("TEST", testW)} ${pad("PASS", passW)} ${pad("Δ RATE", deltaW, "right")}`,
	);

	for (const item of withScoreDeltas) {
		const delta = item.deltas.automatedScore!;
		const deltaStr = formatDelta(delta.passRateDelta, "%");

		console.log(
			`${pad(truncate(item.model, modelW), modelW)} ` +
			`${pad(item.harness, harnessW)} ` +
			`${pad(truncate(item.test, testW), testW)} ` +
			`${pad(item.passType, passW)} ` +
			`${pad(deltaStr, deltaW, "right")}`,
		);
	}
	console.log("");
}

/**
 * Prints items only in one run.
 */
function printExclusiveItems(result: CompareResult): void {
	if (result.onlyInA.length > 0) {
		console.log(`Items only in Run A (${result.onlyInA.length})`);
		console.log("-".repeat(40));
		for (const item of result.onlyInA.slice(0, 10)) {
			console.log(`  ${item.model} / ${item.harness} / ${item.test} / ${item.passType}`);
		}
		if (result.onlyInA.length > 10) {
			console.log(`  ... and ${result.onlyInA.length - 10} more`);
		}
		console.log("");
	}

	if (result.onlyInB.length > 0) {
		console.log(`Items only in Run B (${result.onlyInB.length})`);
		console.log("-".repeat(40));
		for (const item of result.onlyInB.slice(0, 10)) {
			console.log(`  ${item.model} / ${item.harness} / ${item.test} / ${item.passType}`);
		}
		if (result.onlyInB.length > 10) {
			console.log(`  ... and ${result.onlyInB.length - 10} more`);
		}
		console.log("");
	}
}

/** CLI compare command. */
export const compareCommand = new Command("compare")
	.description("Compare two benchmark runs")
	.argument("<run-a>", "First run ID or path (baseline)")
	.argument("<run-b>", "Second run ID or path (comparison)")
	.option("-o, --output <dir>", "Output directory for results", DEFAULT_OUTPUT_DIR)
	.option("--json", "Output raw JSON instead of formatted table")
	.action(async (runA: string, runB: string, options: { output: string; json?: boolean }) => {
		try {
			// Find and read run A
			const dirA = findRunDir(options.output, runA);
			const resultA = await readResult(dirA);

			// Find and read run B
			const dirB = findRunDir(options.output, runB);
			const resultB = await readResult(dirB);

			// Compare runs
			const comparison = compareRuns(resultA, resultB);

			// Output
			if (options.json) {
				console.log(JSON.stringify(comparison, null, 2));
			} else {
				printHeader(comparison);
				printSummary(comparison);
				printRegressions(comparison);
				printImprovements(comparison);
				printScoringDeltas(comparison);
				printExclusiveItems(comparison);
			}
		} catch (error) {
			console.error(
				`Error: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	});
