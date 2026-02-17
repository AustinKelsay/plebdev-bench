/**
 * Purpose: Diagnostics-focused aggregation helpers for coverage, plan alignment, and scoring latency.
 * Exports: computeScoringTimingStats, computeScoringTimingBreakdown, computeDimensionCounts, computeCoverageStats
 *
 * Invariants:
 * - All coverage rates are in 0-1 range
 * - Dimension counts are derived from unique values in matrix-like items
 */

import type { TimingStats } from "./aggregations-core";
import type { MatrixItemResult } from "./types";

type DimensionCountItem = Pick<
	MatrixItemResult,
	"runtime" | "model" | "harness" | "test" | "passType"
>;

/** Timing stats grouped by dimension name. */
export interface GroupTimingStats {
	name: string;
	stats: TimingStats;
}

/** Item-dimension counts used for plan-vs-execution checks. */
export interface DimensionCounts {
	items: number;
	runtimes: number;
	models: number;
	harnesses: number;
	tests: number;
	passTypes: number;
}

/** Coverage rates for key optional scoring/eval fields. */
export interface CoverageStats {
	totalItems: number;
	automatedScoreItems: number;
	automatedScoreCoverage: number;
	frontierEvalItems: number;
	frontierEvalCoverage: number;
}

/**
 * Computes timing statistics from an arbitrary numeric sample.
 *
 * @param values - Timing values in milliseconds
 * @returns Timing stats or null when no values are present
 */
function computeTimingStatsFromValues(values: number[]): TimingStats | null {
	const sortedValues = [...values].sort((a, b) => a - b);
	if (sortedValues.length === 0) return null;

	const sum = sortedValues.reduce((a, b) => a + b, 0);
	const rawP90Index = Math.ceil(sortedValues.length * 0.9) - 1;
	const p90Index = Math.min(sortedValues.length - 1, Math.max(0, rawP90Index));

	const mid = sortedValues.length / 2;
	const median =
		sortedValues.length % 2 === 0
			? (sortedValues[mid - 1] + sortedValues[mid]) / 2
			: sortedValues[Math.floor(mid)];

	return {
		min: sortedValues[0],
		max: sortedValues[sortedValues.length - 1],
		median,
		mean: sum / sortedValues.length,
		p90: sortedValues[p90Index] || sortedValues[sortedValues.length - 1],
		count: sortedValues.length,
	};
}

/**
 * Computes timing statistics from scoring durations.
 *
 * @param items - Matrix items with scoring metrics
 * @returns Scoring timing stats or null if no scoring timing data
 */
export function computeScoringTimingStats(
	items: MatrixItemResult[],
): TimingStats | null {
	const durations = items
		.map((i) => i.scoringMetrics?.durationMs)
		.filter((d): d is number => d !== undefined);

	return computeTimingStatsFromValues(durations);
}

/**
 * Computes scoring timing stats grouped by a dimension.
 *
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @returns Group timing stats sorted by mean descending
 */
export function computeScoringTimingBreakdown(
	items: MatrixItemResult[],
	groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
): GroupTimingStats[] {
	const groups = groupFn(items);
	const breakdown: GroupTimingStats[] = [];

	for (const [name, groupItems] of groups) {
		const groupStats = computeScoringTimingStats(groupItems);
		if (!groupStats) {
			continue;
		}

		breakdown.push({ name, stats: groupStats });
	}

	return breakdown.sort((a, b) => b.stats.mean - a.stats.mean);
}

/**
 * Computes unique dimension counts from matrix items.
 *
 * @param items - Matrix items from plan or run
 * @returns Dimension counts
 */
export function computeDimensionCounts(
	items: DimensionCountItem[],
): DimensionCounts {
	const runtimes = new Set<string>();
	const models = new Set<string>();
	const harnesses = new Set<string>();
	const tests = new Set<string>();
	const passTypes = new Set<string>();

	for (const item of items) {
		runtimes.add(item.runtime);
		models.add(item.model);
		harnesses.add(item.harness);
		tests.add(item.test);
		passTypes.add(item.passType);
	}

	return {
		items: items.length,
		runtimes: runtimes.size,
		models: models.size,
		harnesses: harnesses.size,
		tests: tests.size,
		passTypes: passTypes.size,
	};
}

/**
 * Computes coverage rates for automated scoring and frontier eval.
 *
 * @param items - Matrix items
 * @returns Coverage counts and 0-1 coverage rates
 */
export function computeCoverageStats(items: MatrixItemResult[]): CoverageStats {
	const totalItems = items.length;
	const automatedScoreItems = items.filter((i) => i.automatedScore).length;
	const frontierEvalItems = items.filter((i) => i.frontierEval).length;

	return {
		totalItems,
		automatedScoreItems,
		automatedScoreCoverage:
			totalItems > 0 ? automatedScoreItems / totalItems : 0,
		frontierEvalItems,
		frontierEvalCoverage: totalItems > 0 ? frontierEvalItems / totalItems : 0,
	};
}
