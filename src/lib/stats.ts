/**
 * Purpose: Calculate and format run statistics for display.
 * Exports: calculateRunStats, formatRunStats, RunStats
 *
 * Provides detailed breakdowns of timing, tokens, scoring, and frontier eval
 * results across different dimensions (harness, model, test).
 */

import type { MatrixItemResult } from "../schemas/index.js";
export { formatRunStats } from "./stats-format.js";

/** Timing statistics. */
export interface TimingStats {
	/** Average generation time in ms. */
	avgGenerationMs: number;
	/** Average total scoring pipeline time in ms (includes retry generation when used). */
	avgScoringMs: number | null;
	/** Average pure scoring evaluation time in ms (excludes retry generation). */
	avgScoringOnlyMs?: number | null;
	/** Average compile-retry generation time in ms across items that retried. */
	avgRetryGenerationMs?: number | null;
	/** Number of items that used compile-retry generation. */
	scoringItemsWithRetry?: number;
	/** Average frontier eval time in ms (if available). */
	avgFrontierEvalMs: number | null;
	/** Min/max generation time. */
	minGenerationMs: number;
	maxGenerationMs: number;
}

/** Token statistics (Ollama only). */
export interface TokenStats {
	/** Total prompt tokens across all items. */
	totalPromptTokens: number;
	/** Total completion tokens across all items. */
	totalCompletionTokens: number;
	/** Average completion tokens per item. */
	avgCompletionTokens: number;
	/** Number of items with token data. */
	itemsWithTokens: number;
}

/** Breakdown by dimension (test, harness, model). */
export interface DimensionBreakdown {
	name: string;
	passed: number;
	total: number;
	passRate: number;
}

/** Scoring statistics. */
export interface ScoringStats {
	/** Semantic pass rate across scored assertions only. */
	passRate: number;
	/** Total tests passed. */
	totalPassed: number;
	/** Total tests run. */
	totalTests: number;
	/** Number of rows that produced an automated score. */
	scoredItems: number;
	/** Number of rows in the run. */
	totalItems: number;
	/** Number of fully successful rows. */
	completedItems: number;
	/** Item-level success rate across the full run. */
	itemSuccessRate: number;
	/** Fraction of scheduled rows that reached scoring. */
	scoredItemRate: number;
	/** Breakdown by test. */
	byTest: DimensionBreakdown[];
	/** Breakdown by harness. */
	byHarness: DimensionBreakdown[];
	/** Breakdown by model. */
	byModel: DimensionBreakdown[];
}

/** Frontier eval breakdown. */
export interface FrontierBreakdown {
	name: string;
	avgScore: number;
	count: number;
}

/** Frontier eval statistics. */
export interface FrontierStats {
	/** Average score across all items. */
	avgScore: number;
	/** Number of items with eval. */
	itemCount: number;
	/** Min/max scores. */
	minScore: number;
	maxScore: number;
	/** Breakdown by harness. */
	byHarness: FrontierBreakdown[];
	/** Breakdown by model. */
	byModel: FrontierBreakdown[];
}

/** Failure breakdown by type. */
export interface FailureBreakdown {
	type: string;
	count: number;
}

/** Generation failure statistics. */
export interface GenerationFailureStats {
	/** Total number of generation failures. */
	total: number;
	/** Breakdown by failure type. */
	byType: FailureBreakdown[];
}

/** Complete run statistics. */
export interface RunStats {
	timing: TimingStats;
	tokens: TokenStats | null;
	scoring: ScoringStats | null;
	frontier: FrontierStats | null;
	generationFailures: GenerationFailureStats | null;
}

/**
 * Calculates average from an array of numbers.
 */
function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Groups items by a key and calculates aggregate stats.
 */
function groupBy<T, R>(
	items: T[],
	keyFn: (item: T) => string,
	aggregateFn: (items: T[]) => R,
): Map<string, R> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const key = keyFn(item);
		const group = groups.get(key) || [];
		group.push(item);
		groups.set(key, group);
	}
	const result = new Map<string, R>();
	for (const [key, group] of groups) {
		result.set(key, aggregateFn(group));
	}
	return result;
}

/**
 * Calculates timing statistics from results.
 */
function calculateTimingStats(results: MatrixItemResult[]): TimingStats {
	const generationTimes = results
		.filter((r) => r.generation?.durationMs !== undefined)
		.map((r) => r.generation!.durationMs);

	const scoringTimes = results
		.filter((r) => r.scoringMetrics?.durationMs !== undefined)
		.map((r) => r.scoringMetrics!.durationMs);
	const scoringOnlyTimes = results
		.filter(
			(r) =>
				r.scoringMetrics?.scoringDurationMs !== undefined ||
				r.scoringMetrics?.durationMs !== undefined,
		)
		.map(
			(r) =>
				r.scoringMetrics?.scoringDurationMs ?? r.scoringMetrics!.durationMs,
		);
	const retryGenerationTimes = results
		.filter((r) => r.scoringMetrics?.retryGenerationDurationMs !== undefined)
		.map((r) => r.scoringMetrics!.retryGenerationDurationMs!);

	const frontierTimes = results
		.filter((r) => r.frontierEval?.latencyMs !== undefined)
		.map((r) => r.frontierEval!.latencyMs!);

	return {
		avgGenerationMs: avg(generationTimes),
		avgScoringMs: scoringTimes.length > 0 ? avg(scoringTimes) : null,
		avgScoringOnlyMs:
			scoringOnlyTimes.length > 0 ? avg(scoringOnlyTimes) : null,
		avgRetryGenerationMs:
			retryGenerationTimes.length > 0 ? avg(retryGenerationTimes) : null,
		scoringItemsWithRetry: retryGenerationTimes.length,
		avgFrontierEvalMs: frontierTimes.length > 0 ? avg(frontierTimes) : null,
		minGenerationMs:
			generationTimes.length > 0 ? Math.min(...generationTimes) : 0,
		maxGenerationMs:
			generationTimes.length > 0 ? Math.max(...generationTimes) : 0,
	};
}

/**
 * Calculates token statistics from results.
 */
function calculateTokenStats(results: MatrixItemResult[]): TokenStats | null {
	const withTokens = results.filter(
		(r) =>
			r.generation?.promptTokens !== undefined &&
			r.generation?.completionTokens !== undefined,
	);

	if (withTokens.length === 0) return null;

	const totalPrompt = withTokens.reduce(
		(acc, r) => acc + (r.generation!.promptTokens ?? 0),
		0,
	);
	const totalCompletion = withTokens.reduce(
		(acc, r) => acc + (r.generation!.completionTokens ?? 0),
		0,
	);

	return {
		totalPromptTokens: totalPrompt,
		totalCompletionTokens: totalCompletion,
		avgCompletionTokens: Math.round(totalCompletion / withTokens.length),
		itemsWithTokens: withTokens.length,
	};
}

/**
 * Calculates scoring statistics from results.
 */
function calculateScoringStats(
	results: MatrixItemResult[],
): ScoringStats | null {
	const withScores = results.filter((r) => r.automatedScore !== undefined);
	if (withScores.length === 0) return null;

	const totalPassed = withScores.reduce(
		(acc, r) => acc + (r.automatedScore!.passed ?? 0),
		0,
	);
	const totalTests = withScores.reduce(
		(acc, r) => acc + (r.automatedScore!.total ?? 0),
		0,
	);
	const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
	const completedItems = results.filter((r) => r.status === "completed").length;
	const totalItems = results.length;
	const scoredItems = withScores.length;
	const itemSuccessRate =
		totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
	const scoredItemRate = totalItems > 0 ? (scoredItems / totalItems) * 100 : 0;

	// Breakdown by test
	const byTestMap = groupBy(
		withScores,
		(r) => r.test,
		(items) => {
			const passed = items.reduce(
				(acc, r) => acc + (r.automatedScore!.passed ?? 0),
				0,
			);
			const total = items.reduce(
				(acc, r) => acc + (r.automatedScore!.total ?? 0),
				0,
			);
			return {
				passed,
				total,
				passRate: total > 0 ? (passed / total) * 100 : 0,
			};
		},
	);

	// Breakdown by harness
	const byHarnessMap = groupBy(
		withScores,
		(r) => r.harness,
		(items) => {
			const passed = items.reduce(
				(acc, r) => acc + (r.automatedScore!.passed ?? 0),
				0,
			);
			const total = items.reduce(
				(acc, r) => acc + (r.automatedScore!.total ?? 0),
				0,
			);
			return {
				passed,
				total,
				passRate: total > 0 ? (passed / total) * 100 : 0,
			};
		},
	);

	// Breakdown by model
	const byModelMap = groupBy(
		withScores,
		(r) => r.model,
		(items) => {
			const passed = items.reduce(
				(acc, r) => acc + (r.automatedScore!.passed ?? 0),
				0,
			);
			const total = items.reduce(
				(acc, r) => acc + (r.automatedScore!.total ?? 0),
				0,
			);
			return {
				passed,
				total,
				passRate: total > 0 ? (passed / total) * 100 : 0,
			};
		},
	);

	return {
		passRate,
		totalPassed,
		totalTests,
		scoredItems,
		totalItems,
		completedItems,
		itemSuccessRate,
		scoredItemRate,
		byTest: Array.from(byTestMap.entries())
			.map(([name, stats]) => ({ name, ...stats }))
			.sort((a, b) => b.passRate - a.passRate),
		byHarness: Array.from(byHarnessMap.entries())
			.map(([name, stats]) => ({ name, ...stats }))
			.sort((a, b) => b.passRate - a.passRate),
		byModel: Array.from(byModelMap.entries())
			.map(([name, stats]) => ({ name, ...stats }))
			.sort((a, b) => b.passRate - a.passRate),
	};
}

/**
 * Calculates frontier eval statistics from results.
 */
function calculateFrontierStats(
	results: MatrixItemResult[],
): FrontierStats | null {
	const withEval = results.filter((r) => r.frontierEval !== undefined);
	if (withEval.length === 0) return null;

	const scores = withEval.map((r) => r.frontierEval!.score);
	const avgScore = avg(scores);

	// Breakdown by harness
	const byHarnessMap = groupBy(
		withEval,
		(r) => r.harness,
		(items) => ({
			avgScore: avg(items.map((i) => i.frontierEval!.score)),
			count: items.length,
		}),
	);

	// Breakdown by model
	const byModelMap = groupBy(
		withEval,
		(r) => r.model,
		(items) => ({
			avgScore: avg(items.map((i) => i.frontierEval!.score)),
			count: items.length,
		}),
	);

	return {
		avgScore,
		itemCount: withEval.length,
		minScore: Math.min(...scores),
		maxScore: Math.max(...scores),
		byHarness: Array.from(byHarnessMap.entries())
			.map(([name, stats]) => ({ name, ...stats }))
			.sort((a, b) => b.avgScore - a.avgScore),
		byModel: Array.from(byModelMap.entries())
			.map(([name, stats]) => ({ name, ...stats }))
			.sort((a, b) => b.avgScore - a.avgScore),
	};
}

/**
 * Calculates generation failure statistics from results.
 */
function calculateGenerationFailureStats(
	results: MatrixItemResult[],
): GenerationFailureStats | null {
	const failures = results.filter((r) => r.generation && !r.generation.success);

	if (failures.length === 0) return null;

	// Group by failure type
	const typeMap = new Map<string, number>();
	for (const r of failures) {
		const type = r.generation?.failureType ?? "unknown";
		typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
	}

	return {
		total: failures.length,
		byType: Array.from(typeMap.entries())
			.map(([type, count]) => ({ type, count }))
			.sort((a, b) => b.count - a.count),
	};
}

/**
 * Calculates all run statistics from results.
 *
 * @param results - Array of matrix item results
 * @returns Complete run statistics
 */
export function calculateRunStats(results: MatrixItemResult[]): RunStats {
	return {
		timing: calculateTimingStats(results),
		tokens: calculateTokenStats(results),
		scoring: calculateScoringStats(results),
		frontier: calculateFrontierStats(results),
		generationFailures: calculateGenerationFailureStats(results),
	};
}
