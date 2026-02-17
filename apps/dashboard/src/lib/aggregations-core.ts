/**
 * Purpose: Core aggregation utilities for dashboard views (pass rates, grouping, timing, eval).
 * Exports: computePassRate, computeItemPassRate, groupBy*, computeTimingStats, computeFrontierStats, computeBreakdown, computeFailureStats, computeBlindInformedBreakdown
 *
 * Invariants:
 * - Pass rates are derived from automatedScore totals (0-1 range)
 * - Grouping keys are stable string identifiers intended for UI tables/charts
 */

import type { AutomatedScore, MatrixItemResult } from "./types";
import { TOOL_SMOKE_TEST_SLUG } from "./types";

/** Pass rate for a set of items (0-1 range). */
export interface PassRateResult {
	passRate: number;
	passed: number;
	total: number;
}

/**
 * Computes pass rate from automated scores.
 *
 * @param items - Matrix items with optional automatedScore
 * @returns Pass rate as 0-1 value, plus passed/total counts
 */
export function computePassRate(items: MatrixItemResult[]): PassRateResult {
	const withScores = items.filter((i) => i.automatedScore);
	if (withScores.length === 0) {
		return { passRate: 0, passed: 0, total: 0 };
	}

	const totalTests = withScores.reduce(
		(acc, i) => acc + (i.automatedScore?.total ?? 0),
		0,
	);
	const passedTests = withScores.reduce(
		(acc, i) => acc + (i.automatedScore?.passed ?? 0),
		0,
	);

	return {
		passRate: totalTests > 0 ? passedTests / totalTests : 0,
		passed: passedTests,
		total: totalTests,
	};
}

/**
 * Computes pass rate from a single automated score.
 *
 * @param score - Automated score object
 * @returns Pass rate in 0-1 range
 */
export function computeItemPassRate(score: AutomatedScore | undefined): number {
	if (!score || score.total === 0) return 0;
	return score.passed / score.total;
}

/**
 * Groups items by model name.
 *
 * @param items - Matrix items
 * @returns Map keyed by model string
 */
export function groupByModel(
	items: MatrixItemResult[],
): Map<string, MatrixItemResult[]> {
	return items.reduce((map, item) => {
		const group = map.get(item.model) || [];
		group.push(item);
		map.set(item.model, group);
		return map;
	}, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by runtime name.
 *
 * @param items - Matrix items
 * @returns Map keyed by runtime string
 */
export function groupByRuntime(
	items: MatrixItemResult[],
): Map<string, MatrixItemResult[]> {
	return items.reduce((map, item) => {
		const group = map.get(item.runtime) || [];
		group.push(item);
		map.set(item.runtime, group);
		return map;
	}, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by harness name.
 *
 * @param items - Matrix items
 * @returns Map keyed by harness string
 */
export function groupByHarness(
	items: MatrixItemResult[],
): Map<string, MatrixItemResult[]> {
	return items.reduce((map, item) => {
		const group = map.get(item.harness) || [];
		group.push(item);
		map.set(item.harness, group);
		return map;
	}, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by test name.
 *
 * @param items - Matrix items
 * @returns Map keyed by test slug string
 */
export function groupByTest(
	items: MatrixItemResult[],
): Map<string, MatrixItemResult[]> {
	return items.reduce((map, item) => {
		const group = map.get(item.test) || [];
		group.push(item);
		map.set(item.test, group);
		return map;
	}, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by combined runtime + model + harness name.
 *
 * @param items - Matrix items
 * @returns Map keyed by `"runtime / model / harness"`
 */
export function groupByModelHarness(
	items: MatrixItemResult[],
): Map<string, MatrixItemResult[]> {
	return items.reduce((map, item) => {
		const key = `${item.runtime} / ${item.model} / ${item.harness}`;
		const group = map.get(key) || [];
		group.push(item);
		map.set(key, group);
		return map;
	}, new Map<string, MatrixItemResult[]>());
}

/** Timing statistics. */
export interface TimingStats {
	min: number;
	max: number;
	median: number;
	mean: number;
	p90: number;
	count: number;
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

	return {
		min: sortedValues[0],
		max: sortedValues[sortedValues.length - 1],
		median: sortedValues[Math.floor(sortedValues.length / 2)],
		mean: sum / sortedValues.length,
		p90: sortedValues[p90Index] || sortedValues[sortedValues.length - 1],
		count: sortedValues.length,
	};
}

/**
 * Computes timing statistics from generation durations.
 *
 * @param items - Matrix items with generation data
 * @returns Timing stats or null if no timing data
 */
export function computeTimingStats(
	items: MatrixItemResult[],
): TimingStats | null {
	const durations = items
		.map((i) => i.generation?.durationMs)
		.filter((d): d is number => d !== undefined);

	return computeTimingStatsFromValues(durations);
}

/** Frontier eval statistics. */
export interface FrontierStats {
	avgScore: number;
	minScore: number;
	maxScore: number;
	count: number;
}

/**
 * Computes frontier eval statistics.
 *
 * @param items - Matrix items with frontier eval data
 * @returns Frontier stats or null if no eval data
 */
export function computeFrontierStats(
	items: MatrixItemResult[],
): FrontierStats | null {
	const scores = items
		.map((i) => i.frontierEval?.score)
		.filter((s): s is number => s !== undefined);

	if (scores.length === 0) return null;

	const sum = scores.reduce((a, b) => a + b, 0);

	return {
		avgScore: sum / scores.length,
		minScore: Math.min(...scores),
		maxScore: Math.max(...scores),
		count: scores.length,
	};
}

/** Dimension breakdown for charts. */
export interface DimensionBreakdown {
	name: string;
	passRate: number;
	passed: number;
	total: number;
	count: number;
}

/**
 * Computes pass rate breakdown by a dimension (model/harness/test).
 *
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @returns Array of breakdowns sorted by pass rate descending
 */
export function computeBreakdown(
	items: MatrixItemResult[],
	groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
): DimensionBreakdown[] {
	const groups = groupFn(items);
	const breakdowns: DimensionBreakdown[] = [];

	for (const [name, groupItems] of groups) {
		const { passRate, passed, total } = computePassRate(groupItems);
		breakdowns.push({
			name,
			passRate,
			passed,
			total,
			count: groupItems.length,
		});
	}

	return breakdowns.sort((a, b) => b.passRate - a.passRate);
}

/** Failure counts by type. */
export interface FailureStats {
	generationFailures: Map<string, number>;
	scoringFailures: Map<string, number>;
	frontierEvalFailures: Map<string, number>;
	frontierEvalFailureDetails: Array<{
		id: string;
		runtime: string;
		model: string;
		harness: string;
		test: string;
		passType: string;
		type: string;
		status?: number;
		latencyMs?: number;
		evalModel?: string;
		attempts?: number;
	}>;
	totalGenerationFailures: number;
	totalScoringFailures: number;
	totalFrontierEvalFailures: number;
}

/**
 * Computes failure statistics from items.
 *
 * @param items - Matrix items
 * @returns Failure counts grouped by type
 */
export function computeFailureStats(items: MatrixItemResult[]): FailureStats {
	const generationFailures = new Map<string, number>();
	const scoringFailures = new Map<string, number>();
	const frontierEvalFailures = new Map<string, number>();
	const frontierEvalFailureDetails: FailureStats["frontierEvalFailureDetails"] =
		[];

	for (const item of items) {
		if (item.generationFailure) {
			const count = generationFailures.get(item.generationFailure.type) || 0;
			generationFailures.set(item.generationFailure.type, count + 1);
		}
		if (item.scoringFailure) {
			const count = scoringFailures.get(item.scoringFailure.type) || 0;
			scoringFailures.set(item.scoringFailure.type, count + 1);
		}
		if (item.frontierEvalFailure) {
			const count =
				frontierEvalFailures.get(item.frontierEvalFailure.type) || 0;
			frontierEvalFailures.set(item.frontierEvalFailure.type, count + 1);
			frontierEvalFailureDetails.push({
				id: item.id,
				runtime: item.runtime,
				model: item.model,
				harness: item.harness,
				test: item.test,
				passType: item.passType,
				type: item.frontierEvalFailure.type,
				...(item.frontierEvalFailure.status !== undefined
					? { status: item.frontierEvalFailure.status }
					: {}),
				...(item.frontierEvalFailure.latencyMs !== undefined
					? { latencyMs: item.frontierEvalFailure.latencyMs }
					: {}),
				...(item.frontierEvalFailure.model
					? { evalModel: item.frontierEvalFailure.model }
					: {}),
				...(item.frontierEvalFailure.attempts !== undefined
					? { attempts: item.frontierEvalFailure.attempts }
					: {}),
			});
		}
	}

	return {
		generationFailures,
		scoringFailures,
		frontierEvalFailures,
		frontierEvalFailureDetails,
		totalGenerationFailures: Array.from(generationFailures.values()).reduce(
			(a, b) => a + b,
			0,
		),
		totalScoringFailures: Array.from(scoringFailures.values()).reduce(
			(a, b) => a + b,
			0,
		),
		totalFrontierEvalFailures: Array.from(frontierEvalFailures.values()).reduce(
			(a, b) => a + b,
			0,
		),
	};
}

/** Blind vs informed breakdown for a group. */
export interface BlindInformedBreakdown {
	name: string;
	blindPassRate: number;
	blindPassed: number;
	blindTotal: number;
	informedPassRate: number;
	informedPassed: number;
	informedTotal: number;
	delta: number;
}

/**
 * Computes blind vs informed breakdown by a dimension.
 *
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @returns Breakdown per group with delta
 */
export function computeBlindInformedBreakdown(
	items: MatrixItemResult[],
	groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
): BlindInformedBreakdown[] {
	const groups = groupFn(items);
	const breakdowns: BlindInformedBreakdown[] = [];

	for (const [name, groupItems] of groups) {
		const nonToolSmoke = groupItems.filter(
			(item) => item.test !== TOOL_SMOKE_TEST_SLUG,
		);
		const blind = nonToolSmoke.filter((item) => item.passType === "blind");
		const informed = nonToolSmoke.filter(
			(item) => item.passType === "informed",
		);

		const blindStats = computePassRate(blind);
		const informedStats = computePassRate(informed);

		if (blindStats.total > 0 || informedStats.total > 0) {
			breakdowns.push({
				name,
				blindPassRate: blindStats.passRate,
				blindPassed: blindStats.passed,
				blindTotal: blindStats.total,
				informedPassRate: informedStats.passRate,
				informedPassed: informedStats.passed,
				informedTotal: informedStats.total,
				delta: informedStats.passRate - blindStats.passRate,
			});
		}
	}

	return breakdowns.sort((a, b) => b.delta - a.delta);
}
