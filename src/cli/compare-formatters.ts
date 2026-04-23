/**
 * Purpose: Terminal-native formatters for `bench compare` output.
 * Exports: printHeader, printSummary, printRegressions, printImprovements,
 *          printScoringDeltas, printExclusiveItems
 *
 * Invariants:
 * - Formatting is deterministic and table oriented.
 * - Color is not required to understand status changes.
 */

import { type CompareResult, formatDelta } from "../results/compare.js";
import { formatTimestamp, pad, truncate } from "./compare-utils.js";

/**
 * Prints the header section with run identifiers and timestamps.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printHeader(result: CompareResult): void {
	console.log("");
	console.log("Compare Benchmark Runs");
	console.log("=".repeat(60));
	console.log(
		`Run A: ${result.runA.runId} (${formatTimestamp(result.runA.timestamp)})`,
	);
	console.log(
		`Run B: ${result.runB.runId} (${formatTimestamp(result.runB.timestamp)})`,
	);
	console.log("");
}

/**
 * Prints aggregate compare summary and metric deltas.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printSummary(result: CompareResult): void {
	const { summary } = result;

	console.log("Summary");
	console.log("-".repeat(40));
	console.log(`  Matched items:  ${summary.totalMatched}`);
	console.log(`  Only in A:      ${summary.totalOnlyInA}`);
	console.log(`  Only in B:      ${summary.totalOnlyInB}`);
	console.log("");

	if (
		summary.statusChanges.improved > 0 ||
		summary.statusChanges.regressed > 0
	) {
		console.log("Status Changes");
		console.log("-".repeat(40));
		if (summary.statusChanges.improved > 0) {
			console.log(
				`  Improved:   ${summary.statusChanges.improved} (failed → completed)`,
			);
		}
		if (summary.statusChanges.regressed > 0) {
			console.log(
				`  Regressed:  ${summary.statusChanges.regressed} (completed → failed)`,
			);
		}
		console.log("");
	}

	if (summary.scoringDelta) {
		console.log("Scoring Delta");
		console.log("-".repeat(40));
		console.log(
			`  Raw pass rate:      ${formatDelta(summary.scoringDelta.passRateDelta, "%")}`,
		);
		if (
			summary.metricAvailability.scoring.comparedRows <
			summary.metricAvailability.scoring.matchedRows
		) {
			console.log(
				`  Compared rows:      ${summary.metricAvailability.scoring.comparedRows}/${summary.metricAvailability.scoring.matchedRows}`,
			);
		}
		if (summary.signal.trustedMetricsAvailable) {
			if (summary.trustedScoringDelta) {
				console.log(
					`  Trusted pass rate:  ${formatDelta(summary.trustedScoringDelta.passRateDelta, "%")}`,
				);
				if (
					summary.metricAvailability.scoring.trustedComparedRows !== null &&
					summary.metricAvailability.scoring.trustedComparedRows <
						summary.metricAvailability.scoring.comparedRows
				) {
					console.log(
						`  Trusted rows:       ${summary.metricAvailability.scoring.trustedComparedRows}/${summary.metricAvailability.scoring.comparedRows}`,
					);
				}
			} else {
				console.log(
					"  Trusted pass rate:  unavailable (no trusted scored rows)",
				);
			}
		} else {
			console.log(
				"  Trusted pass rate:  unavailable (signalAssessment missing)",
			);
		}
		console.log("");
	}

	if (summary.frontierEvalDelta) {
		console.log("Frontier Eval Delta");
		console.log("-".repeat(40));
		console.log(
			`  Raw avg score:      ${formatDelta(summary.frontierEvalDelta.avgScoreDelta, "/10")}`,
		);
		if (
			summary.metricAvailability.frontierEval.comparedRows <
			summary.metricAvailability.frontierEval.matchedRows
		) {
			console.log(
				`  Compared rows:      ${summary.metricAvailability.frontierEval.comparedRows}/${summary.metricAvailability.frontierEval.matchedRows}`,
			);
		}
		if (summary.signal.trustedMetricsAvailable) {
			if (summary.trustedFrontierEvalDelta) {
				console.log(
					`  Trusted avg score:  ${formatDelta(summary.trustedFrontierEvalDelta.avgScoreDelta, "/10")}`,
				);
				if (
					summary.metricAvailability.frontierEval.trustedComparedRows !==
						null &&
					summary.metricAvailability.frontierEval.trustedComparedRows <
						summary.metricAvailability.frontierEval.comparedRows
				) {
					console.log(
						`  Trusted rows:       ${summary.metricAvailability.frontierEval.trustedComparedRows}/${summary.metricAvailability.frontierEval.comparedRows}`,
					);
				}
			} else {
				console.log("  Trusted avg score:  unavailable (no trusted eval rows)");
			}
		} else {
			console.log(
				"  Trusted avg score:  unavailable (signalAssessment missing)",
			);
		}
		console.log("");
	}

	if (summary.signal.trustedMetricsAvailable) {
		console.log("Signal");
		console.log("-".repeat(40));
		console.log(`  Tainted in A:  ${summary.signal.taintedInA}`);
		console.log(`  Tainted in B:  ${summary.signal.taintedInB}`);
		console.log("");
	}
}

/**
 * Prints table rows that regressed from completed to failed.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printRegressions(result: CompareResult): void {
	const regressions = result.matched.filter(
		(m) =>
			m.deltas.status?.a === "completed" && m.deltas.status?.b === "failed",
	);

	if (regressions.length === 0) return;

	console.log("Regressions (completed → failed)");
	console.log("-".repeat(60));

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
 * Prints table rows that improved from failed to completed.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printImprovements(result: CompareResult): void {
	const improvements = result.matched.filter(
		(m) =>
			m.deltas.status?.a === "failed" && m.deltas.status?.b === "completed",
	);

	if (improvements.length === 0) return;

	console.log("Improvements (failed → completed)");
	console.log("-".repeat(60));

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
 * Prints scored rows with pass-rate changes of at least one point.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printScoringDeltas(result: CompareResult): void {
	const withScoreDeltas = result.matched.filter(
		(m) =>
			m.deltas.automatedScore &&
			Math.abs(m.deltas.automatedScore.passRateDelta) >= 1,
	);

	if (withScoreDeltas.length === 0) return;

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
 * Prints items present in only one side of the comparison.
 *
 * @param result - Completed compare result
 * @returns Nothing; writes to stdout
 */
export function printExclusiveItems(result: CompareResult): void {
	if (result.onlyInA.length > 0) {
		console.log(`Items only in Run A (${result.onlyInA.length})`);
		console.log("-".repeat(40));
		for (const item of result.onlyInA.slice(0, 10)) {
			console.log(
				`  ${item.model} / ${item.harness} / ${item.test} / ${item.passType}`,
			);
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
			console.log(
				`  ${item.model} / ${item.harness} / ${item.test} / ${item.passType}`,
			);
		}
		if (result.onlyInB.length > 10) {
			console.log(`  ... and ${result.onlyInB.length - 10} more`);
		}
		console.log("");
	}
}
