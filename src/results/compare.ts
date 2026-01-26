/**
 * Purpose: Compare two benchmark runs and compute deltas.
 * Exports: compareRuns, CompareResult, MatchedItem
 *
 * Performs an outer join on matrix items by composite key:
 * model|harness|test|passType
 *
 * Outputs:
 * - Matched items with deltas
 * - Items only in run A
 * - Items only in run B
 */

import type { RunResult, MatrixItemResult, AutomatedScore, FrontierEval } from "../schemas/index.js";

/** Composite key for matching items between runs. */
function buildCompareKey(item: {
	model: string;
	harness: string;
	test: string;
	passType: string;
}): string {
	return `${item.model}|${item.harness}|${item.test}|${item.passType}`;
}

/** Delta for automated score. */
export interface ScoreDelta {
	passedDelta: number;
	failedDelta: number;
	totalDelta: number;
	passRateDelta: number; // Percentage points
}

/** Delta for frontier eval. */
export interface EvalDelta {
	scoreDelta: number;
}

/** Deltas for a matched item. */
export interface ItemDeltas {
	/** Status change (null if same). */
	status: { a: string; b: string } | null;

	/** Automated score delta (null if neither has score). */
	automatedScore: ScoreDelta | null;

	/** Frontier eval delta (null if neither has eval). */
	frontierEval: EvalDelta | null;

	/** Duration delta in ms (b - a, null if missing). */
	durationMs: number | null;
}

/** A matched item with its deltas. */
export interface MatchedItem {
	key: string;
	model: string;
	harness: string;
	test: string;
	passType: string;
	itemA: MatrixItemResult;
	itemB: MatrixItemResult;
	deltas: ItemDeltas;
}

/** Summary statistics for comparison. */
export interface CompareSummary {
	totalMatched: number;
	totalOnlyInA: number;
	totalOnlyInB: number;
	statusChanges: {
		improved: number; // failed -> completed
		regressed: number; // completed -> failed
	};
	scoringDelta: {
		passRateDelta: number; // Overall pass rate change
		totalTestsDelta: number;
	} | null;
	frontierEvalDelta: {
		avgScoreDelta: number;
	} | null;
}

/** Complete comparison result. */
export interface CompareResult {
	runA: {
		runId: string;
		timestamp: string;
	};
	runB: {
		runId: string;
		timestamp: string;
	};
	summary: CompareSummary;
	matched: MatchedItem[];
	onlyInA: MatrixItemResult[];
	onlyInB: MatrixItemResult[];
}

/**
 * Calculates pass rate as a percentage.
 */
function calculatePassRate(score: AutomatedScore | undefined): number | null {
	if (!score || score.total === 0) return null;
	return (score.passed / score.total) * 100;
}

/**
 * Computes deltas between two matched items.
 */
function computeDeltas(a: MatrixItemResult, b: MatrixItemResult): ItemDeltas {
	// Status change
	const statusChanged = a.status !== b.status;
	const status = statusChanged ? { a: a.status, b: b.status } : null;

	// Automated score delta
	let automatedScore: ScoreDelta | null = null;
	if (a.automatedScore || b.automatedScore) {
		const scoreA = a.automatedScore || { passed: 0, failed: 0, total: 0 };
		const scoreB = b.automatedScore || { passed: 0, failed: 0, total: 0 };
		const passRateA = calculatePassRate(a.automatedScore) ?? 0;
		const passRateB = calculatePassRate(b.automatedScore) ?? 0;

		automatedScore = {
			passedDelta: scoreB.passed - scoreA.passed,
			failedDelta: scoreB.failed - scoreA.failed,
			totalDelta: scoreB.total - scoreA.total,
			passRateDelta: passRateB - passRateA,
		};
	}

	// Frontier eval delta
	let frontierEval: EvalDelta | null = null;
	if (a.frontierEval || b.frontierEval) {
		const scoreA = a.frontierEval?.score ?? 0;
		const scoreB = b.frontierEval?.score ?? 0;
		frontierEval = {
			scoreDelta: scoreB - scoreA,
		};
	}

	// Duration delta
	let durationMs: number | null = null;
	const durA = a.generation?.durationMs;
	const durB = b.generation?.durationMs;
	if (durA !== undefined && durB !== undefined) {
		durationMs = durB - durA;
	}

	return { status, automatedScore, frontierEval, durationMs };
}

/**
 * Computes summary statistics from matched items.
 */
function computeSummary(
	matched: MatchedItem[],
	onlyInA: MatrixItemResult[],
	onlyInB: MatrixItemResult[],
): CompareSummary {
	// Count status changes
	let improved = 0;
	let regressed = 0;
	for (const m of matched) {
		if (m.deltas.status) {
			if (m.deltas.status.a === "failed" && m.deltas.status.b === "completed") {
				improved++;
			} else if (m.deltas.status.a === "completed" && m.deltas.status.b === "failed") {
				regressed++;
			}
		}
	}

	// Overall scoring delta
	let scoringDelta: CompareSummary["scoringDelta"] = null;
	const itemsWithScoreA = matched.filter((m) => m.itemA.automatedScore);
	const itemsWithScoreB = matched.filter((m) => m.itemB.automatedScore);

	if (itemsWithScoreA.length > 0 || itemsWithScoreB.length > 0) {
		const totalTestsA = itemsWithScoreA.reduce((acc, m) => acc + (m.itemA.automatedScore?.total ?? 0), 0);
		const passedTestsA = itemsWithScoreA.reduce((acc, m) => acc + (m.itemA.automatedScore?.passed ?? 0), 0);
		const totalTestsB = itemsWithScoreB.reduce((acc, m) => acc + (m.itemB.automatedScore?.total ?? 0), 0);
		const passedTestsB = itemsWithScoreB.reduce((acc, m) => acc + (m.itemB.automatedScore?.passed ?? 0), 0);

		const passRateA = totalTestsA > 0 ? (passedTestsA / totalTestsA) * 100 : 0;
		const passRateB = totalTestsB > 0 ? (passedTestsB / totalTestsB) * 100 : 0;

		scoringDelta = {
			passRateDelta: passRateB - passRateA,
			totalTestsDelta: totalTestsB - totalTestsA,
		};
	}

	// Overall frontier eval delta
	let frontierEvalDelta: CompareSummary["frontierEvalDelta"] = null;
	const itemsWithEvalA = matched.filter((m) => m.itemA.frontierEval);
	const itemsWithEvalB = matched.filter((m) => m.itemB.frontierEval);

	if (itemsWithEvalA.length > 0 || itemsWithEvalB.length > 0) {
		const avgScoreA = itemsWithEvalA.length > 0
			? itemsWithEvalA.reduce((acc, m) => acc + (m.itemA.frontierEval?.score ?? 0), 0) / itemsWithEvalA.length
			: 0;
		const avgScoreB = itemsWithEvalB.length > 0
			? itemsWithEvalB.reduce((acc, m) => acc + (m.itemB.frontierEval?.score ?? 0), 0) / itemsWithEvalB.length
			: 0;

		frontierEvalDelta = {
			avgScoreDelta: avgScoreB - avgScoreA,
		};
	}

	return {
		totalMatched: matched.length,
		totalOnlyInA: onlyInA.length,
		totalOnlyInB: onlyInB.length,
		statusChanges: { improved, regressed },
		scoringDelta,
		frontierEvalDelta,
	};
}

/**
 * Compares two benchmark runs.
 *
 * @param resultA - First run result (baseline)
 * @param resultB - Second run result (comparison)
 * @returns Comparison result with deltas
 *
 * @example
 * ```typescript
 * const comparison = compareRuns(runA, runB);
 * console.log(`Matched: ${comparison.summary.totalMatched}`);
 * console.log(`Pass rate delta: ${comparison.summary.scoringDelta?.passRateDelta}%`);
 * ```
 */
export function compareRuns(resultA: RunResult, resultB: RunResult): CompareResult {
	// Build maps by composite key
	const mapA = new Map<string, MatrixItemResult>();
	const mapB = new Map<string, MatrixItemResult>();

	for (const item of resultA.items) {
		mapA.set(buildCompareKey(item), item);
	}

	for (const item of resultB.items) {
		mapB.set(buildCompareKey(item), item);
	}

	// Find matched items
	const matched: MatchedItem[] = [];
	const onlyInA: MatrixItemResult[] = [];
	const onlyInB: MatrixItemResult[] = [];

	// Process items in A
	for (const [key, itemA] of mapA) {
		const itemB = mapB.get(key);
		if (itemB) {
			matched.push({
				key,
				model: itemA.model,
				harness: itemA.harness,
				test: itemA.test,
				passType: itemA.passType,
				itemA,
				itemB,
				deltas: computeDeltas(itemA, itemB),
			});
		} else {
			onlyInA.push(itemA);
		}
	}

	// Find items only in B
	for (const [key, itemB] of mapB) {
		if (!mapA.has(key)) {
			onlyInB.push(itemB);
		}
	}

	// Sort matched by key for deterministic output
	matched.sort((a, b) => a.key.localeCompare(b.key));
	onlyInA.sort((a, b) => buildCompareKey(a).localeCompare(buildCompareKey(b)));
	onlyInB.sort((a, b) => buildCompareKey(a).localeCompare(buildCompareKey(b)));

	// Compute summary
	const summary = computeSummary(matched, onlyInA, onlyInB);

	return {
		runA: {
			runId: resultA.runId,
			timestamp: resultA.startedAt,
		},
		runB: {
			runId: resultB.runId,
			timestamp: resultB.startedAt,
		},
		summary,
		matched,
		onlyInA,
		onlyInB,
	};
}

/**
 * Formats a delta value with sign and color hint.
 *
 * @param value - Delta value
 * @param suffix - Optional suffix (e.g., "%", "ms")
 * @param invert - If true, negative is good (e.g., for duration)
 * @returns Formatted string with delta symbol
 */
export function formatDelta(
	value: number,
	suffix = "",
	invert = false,
): string {
	const sign = value > 0 ? "+" : "";
	const formatted = `${sign}${value.toFixed(1)}${suffix}`;
	return `Δ ${formatted}`;
}
