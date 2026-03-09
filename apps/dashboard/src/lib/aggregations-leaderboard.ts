/**
 * Purpose: Leaderboard-specific derived metrics for richer dashboard analysis.
 * Exports: model insights, prompt-lift rows, status breakdowns, heatmap data, and leaderboard highlights
 *
 * Invariants:
 * - Derived rates stay in 0-1 range
 * - Model insights always sort strongest evidence-first for vetting tables/charts
 */

import {
	computeBreakdown,
	computePassRate,
	computeTimingStats,
	groupByModel,
	groupByTest,
} from "./aggregations-core.js";
import {
	computeToolUseStats,
	inferToolHarnesses,
	type ToolUseStats,
} from "./aggregations-tooling.js";
import type { MatrixItemResult } from "./types.js";

/** Model-level leaderboard metrics used throughout the richer dashboard. */
export interface LeaderboardModelInsight {
	name: string;
	passRate: number;
	passed: number;
	total: number;
	blindTotal: number;
	informedTotal: number;
	blindPassRate: number | null;
	informedPassRate: number | null;
	informedLift: number | null;
	completionRate: number;
	completedItems: number;
	failedItems: number;
	totalItems: number;
	medianDurationMs: number | null;
	p90DurationMs: number | null;
	frontierAvg: number | null;
	frontierCount: number;
	toolSuccessRate: number | null;
	toolTotal: number;
	testsCovered: number;
	harnessesCovered: number;
	runtimesCovered: number;
}

/** Prompt-sensitivity row used by prompt-lift charts. */
export interface PromptLiftRow {
	name: string;
	blindPassRate: number;
	informedPassRate: number;
	lift: number;
	totalBlind: number;
	totalInformed: number;
	frontierAvg: number | null;
	medianDurationMs: number | null;
}

/** Status composition row for stacked reliability charts. */
export interface StatusBreakdownRow {
	name: string;
	completed: number;
	failed: number;
	pending: number;
	running: number;
	total: number;
	completionRate: number;
	failureRate: number;
}

/** One heatmap cell for model-by-test benchmark coverage. */
export interface BenchmarkHeatmapCell {
	test: string;
	passRate: number | null;
	passed: number;
	total: number;
	completionRate: number;
	frontierAvg: number | null;
}

/** One heatmap row for a model. */
export interface BenchmarkHeatmapRow {
	model: string;
	totalItems: number;
	cells: BenchmarkHeatmapCell[];
}

/** Heatmap payload for the model-by-test comparison grid. */
export interface BenchmarkHeatmap {
	tests: string[];
	rows: BenchmarkHeatmapRow[];
}

/** Headline leaderboard highlights shown in the top hero. */
export interface LeaderboardHighlights {
	topModel: LeaderboardModelInsight | null;
	fastestContender: LeaderboardModelInsight | null;
	hardestTest:
		| {
				name: string;
				passRate: number;
				passed: number;
				total: number;
		  }
		| null;
	biggestPromptLift: PromptLiftRow | null;
}

function getToolStatsForGroup(
	items: MatrixItemResult[],
	toolHarnesses: Set<string>,
): ToolUseStats | null {
	const toolItems = items.filter((item) => toolHarnesses.has(item.harness));
	if (toolItems.length === 0) {
		return null;
	}

	return computeToolUseStats(toolItems);
}

function compareInsightRows(
	left: LeaderboardModelInsight,
	right: LeaderboardModelInsight,
): number {
	if (right.passRate !== left.passRate) {
		return right.passRate - left.passRate;
	}
	if (right.completionRate !== left.completionRate) {
		return right.completionRate - left.completionRate;
	}
	const leftFrontier = left.frontierAvg ?? -1;
	const rightFrontier = right.frontierAvg ?? -1;
	if (rightFrontier !== leftFrontier) {
		return rightFrontier - leftFrontier;
	}
	const leftMedian = left.medianDurationMs ?? Number.POSITIVE_INFINITY;
	const rightMedian = right.medianDurationMs ?? Number.POSITIVE_INFINITY;
	if (leftMedian !== rightMedian) {
		return leftMedian - rightMedian;
	}
	return right.total - left.total;
}

/**
 * Computes model-level insight rows for richer leaderboard vetting.
 *
 * @param items - Filtered leaderboard items
 * @returns Model insight rows sorted by benchmark strength
 */
export function computeModelInsights(
	items: MatrixItemResult[],
): LeaderboardModelInsight[] {
	const groups = groupByModel(items);
	const toolHarnesses = inferToolHarnesses(items);
	const insights: LeaderboardModelInsight[] = [];

	for (const [name, groupItems] of groups) {
		const blindItems = groupItems.filter((item) => item.passType === "blind");
		const informedItems = groupItems.filter(
			(item) => item.passType === "informed",
		);
		const overallPass = computePassRate(groupItems);
		const blindPass = computePassRate(blindItems);
		const informedPass = computePassRate(informedItems);
		const timingStats = computeTimingStats(groupItems);
		const frontierScores = groupItems
			.map((item) => item.frontierEval?.score)
			.filter((score): score is number => score !== undefined);
		const completedItems = groupItems.filter(
			(item) => item.status === "completed",
		).length;
		const failedItems = groupItems.filter((item) => item.status === "failed").length;
		const toolStats = getToolStatsForGroup(groupItems, toolHarnesses);

		insights.push({
			name,
			passRate: overallPass.passRate,
			passed: overallPass.passed,
			total: overallPass.total,
			blindTotal: blindPass.total,
			informedTotal: informedPass.total,
			blindPassRate: blindPass.total > 0 ? blindPass.passRate : null,
			informedPassRate: informedPass.total > 0 ? informedPass.passRate : null,
			informedLift:
				blindPass.total > 0 && informedPass.total > 0
					? informedPass.passRate - blindPass.passRate
					: null,
			completionRate:
				groupItems.length > 0 ? completedItems / groupItems.length : 0,
			completedItems,
			failedItems,
			totalItems: groupItems.length,
			medianDurationMs: timingStats?.median ?? null,
			p90DurationMs: timingStats?.p90 ?? null,
			frontierAvg:
				frontierScores.length > 0
					? frontierScores.reduce((sum, score) => sum + score, 0) /
						frontierScores.length
					: null,
			frontierCount: frontierScores.length,
			toolSuccessRate: toolStats?.toolSuccessRate ?? null,
			toolTotal: toolStats?.totalItems ?? 0,
			testsCovered: new Set(groupItems.map((item) => item.test)).size,
			harnessesCovered: new Set(groupItems.map((item) => item.harness)).size,
			runtimesCovered: new Set(groupItems.map((item) => item.runtime)).size,
		});
	}

	return insights.sort(compareInsightRows);
}

/**
 * Computes per-model prompt lift rows where both pass types are present.
 *
 * @param items - Filtered leaderboard items
 * @returns Prompt-lift rows sorted by biggest positive lift
 */
export function computePromptLiftRows(items: MatrixItemResult[]): PromptLiftRow[] {
	return computeModelInsights(items)
		.filter(
			(insight): insight is LeaderboardModelInsight & {
				blindPassRate: number;
				informedPassRate: number;
				informedLift: number;
			} =>
				insight.blindPassRate !== null &&
				insight.informedPassRate !== null &&
				insight.informedLift !== null,
		)
		.map((insight) => ({
			name: insight.name,
			blindPassRate: insight.blindPassRate,
			informedPassRate: insight.informedPassRate,
			lift: insight.informedLift,
			totalBlind: insight.blindTotal,
			totalInformed: insight.informedTotal,
			frontierAvg: insight.frontierAvg,
			medianDurationMs: insight.medianDurationMs,
		}))
		.sort((left, right) => right.lift - left.lift);
}

/**
 * Computes status composition for an arbitrary grouping dimension.
 *
 * @param items - Filtered leaderboard items
 * @param groupFn - Grouping function from aggregations-core
 * @returns Status rows sorted by failure rate descending
 */
export function computeStatusBreakdown(
	items: MatrixItemResult[],
	groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
): StatusBreakdownRow[] {
	const groups = groupFn(items);
	const rows: StatusBreakdownRow[] = [];

	for (const [name, groupItems] of groups) {
		const completed = groupItems.filter((item) => item.status === "completed").length;
		const failed = groupItems.filter((item) => item.status === "failed").length;
		const pending = groupItems.filter((item) => item.status === "pending").length;
		const running = groupItems.filter((item) => item.status === "running").length;
		const total = groupItems.length;

		rows.push({
			name,
			completed,
			failed,
			pending,
			running,
			total,
			completionRate: total > 0 ? completed / total : 0,
			failureRate: total > 0 ? failed / total : 0,
		});
	}

	return rows.sort((left, right) => {
		if (right.failureRate !== left.failureRate) {
			return right.failureRate - left.failureRate;
		}
		return right.total - left.total;
	});
}

/**
 * Builds model-by-test heatmap data from the current leaderboard scope.
 *
 * @param items - Filtered leaderboard items
 * @param modelLimit - Max number of models to render as rows
 * @returns Heatmap payload for benchmark comparison cards
 */
export function computeBenchmarkHeatmap(
	items: MatrixItemResult[],
	modelLimit = 8,
): BenchmarkHeatmap {
	const topModels = computeModelInsights(items)
		.slice(0, modelLimit)
		.map((insight) => insight.name);
	const testBreakdown = computeBreakdown(items, groupByTest)
		.sort((left, right) =>
			left.passRate === right.passRate
				? left.name.localeCompare(right.name)
				: left.passRate - right.passRate,
		)
		.map((row) => row.name);
	const tests = [...new Set(testBreakdown)];
	const modelMap = groupByModel(items);

	return {
		tests,
		rows: topModels.map((model) => {
			const groupItems = modelMap.get(model) ?? [];
			return {
				model,
				totalItems: groupItems.length,
				cells: tests.map((test) => {
					const testItems = groupItems.filter((item) => item.test === test);
					const pass = computePassRate(testItems);
					const completed = testItems.filter(
						(item) => item.status === "completed",
					).length;
					const frontierScores = testItems
						.map((item) => item.frontierEval?.score)
						.filter((score): score is number => score !== undefined);

					return {
						test,
						passRate: pass.total > 0 ? pass.passRate : null,
						passed: pass.passed,
						total: pass.total,
						completionRate:
							testItems.length > 0 ? completed / testItems.length : 0,
						frontierAvg:
							frontierScores.length > 0
								? frontierScores.reduce((sum, score) => sum + score, 0) /
									frontierScores.length
								: null,
					};
				}),
			};
		}),
	};
}

/**
 * Computes headline leaderboard highlights for the top hero section.
 *
 * @param items - Filtered leaderboard items
 * @returns Highlight bundle for benchmark storytelling
 */
export function computeLeaderboardHighlights(
	items: MatrixItemResult[],
): LeaderboardHighlights {
	const insights = computeModelInsights(items);
	const promptLift = computePromptLiftRows(items);
	const overallPassRate = computePassRate(items).passRate;
	const fastestCandidates = insights.filter(
		(insight) =>
			insight.medianDurationMs !== null &&
			insight.passRate >= Math.max(0, overallPassRate - 0.05),
	);
	const hardestTest = [...computeBreakdown(items, groupByTest)]
		.sort((left, right) => left.passRate - right.passRate)[0];

	return {
		topModel: insights[0] ?? null,
		fastestContender:
			fastestCandidates.sort(compareInsightRows).sort((left, right) => {
				const leftMedian = left.medianDurationMs ?? Number.POSITIVE_INFINITY;
				const rightMedian = right.medianDurationMs ?? Number.POSITIVE_INFINITY;
				return leftMedian - rightMedian;
			})[0] ?? insights.find((insight) => insight.medianDurationMs !== null) ?? null,
		hardestTest: hardestTest ?? null,
		biggestPromptLift: promptLift[0] ?? null,
	};
}
