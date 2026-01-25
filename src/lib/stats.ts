/**
 * Purpose: Calculate and format run statistics for display.
 * Exports: calculateRunStats, formatRunStats, RunStats
 *
 * Provides detailed breakdowns of timing, tokens, scoring, and frontier eval
 * results across different dimensions (harness, model, test).
 */

import type { MatrixItemResult } from "../schemas/index.js";

/** Timing statistics. */
export interface TimingStats {
	/** Average generation time in ms. */
	avgGenerationMs: number;
	/** Average scoring time in ms (if available). */
	avgScoringMs: number | null;
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
	/** Overall pass rate. */
	passRate: number;
	/** Total tests passed. */
	totalPassed: number;
	/** Total tests run. */
	totalTests: number;
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

	const frontierTimes = results
		.filter((r) => r.frontierEval?.latencyMs !== undefined)
		.map((r) => r.frontierEval!.latencyMs!);

	return {
		avgGenerationMs: avg(generationTimes),
		avgScoringMs: scoringTimes.length > 0 ? avg(scoringTimes) : null,
		avgFrontierEvalMs: frontierTimes.length > 0 ? avg(frontierTimes) : null,
		minGenerationMs: generationTimes.length > 0 ? Math.min(...generationTimes) : 0,
		maxGenerationMs: generationTimes.length > 0 ? Math.max(...generationTimes) : 0,
	};
}

/**
 * Calculates token statistics from results.
 */
function calculateTokenStats(results: MatrixItemResult[]): TokenStats | null {
	const withTokens = results.filter(
		(r) => r.generation?.promptTokens !== undefined && r.generation?.completionTokens !== undefined,
	);

	if (withTokens.length === 0) return null;

	const totalPrompt = withTokens.reduce((acc, r) => acc + (r.generation!.promptTokens ?? 0), 0);
	const totalCompletion = withTokens.reduce((acc, r) => acc + (r.generation!.completionTokens ?? 0), 0);

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
function calculateScoringStats(results: MatrixItemResult[]): ScoringStats | null {
	const withScores = results.filter((r) => r.automatedScore !== undefined);
	if (withScores.length === 0) return null;

	const totalPassed = withScores.reduce((acc, r) => acc + (r.automatedScore!.passed ?? 0), 0);
	const totalTests = withScores.reduce((acc, r) => acc + (r.automatedScore!.total ?? 0), 0);
	const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

	// Breakdown by test
	const byTestMap = groupBy(
		withScores,
		(r) => r.test,
		(items) => {
			const passed = items.reduce((acc, r) => acc + (r.automatedScore!.passed ?? 0), 0);
			const total = items.reduce((acc, r) => acc + (r.automatedScore!.total ?? 0), 0);
			return { passed, total, passRate: total > 0 ? (passed / total) * 100 : 0 };
		},
	);

	// Breakdown by harness
	const byHarnessMap = groupBy(
		withScores,
		(r) => r.harness,
		(items) => {
			const passed = items.reduce((acc, r) => acc + (r.automatedScore!.passed ?? 0), 0);
			const total = items.reduce((acc, r) => acc + (r.automatedScore!.total ?? 0), 0);
			return { passed, total, passRate: total > 0 ? (passed / total) * 100 : 0 };
		},
	);

	// Breakdown by model
	const byModelMap = groupBy(
		withScores,
		(r) => r.model,
		(items) => {
			const passed = items.reduce((acc, r) => acc + (r.automatedScore!.passed ?? 0), 0);
			const total = items.reduce((acc, r) => acc + (r.automatedScore!.total ?? 0), 0);
			return { passed, total, passRate: total > 0 ? (passed / total) * 100 : 0 };
		},
	);

	return {
		passRate,
		totalPassed,
		totalTests,
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
function calculateFrontierStats(results: MatrixItemResult[]): FrontierStats | null {
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
function calculateGenerationFailureStats(results: MatrixItemResult[]): GenerationFailureStats | null {
	const failures = results.filter(
		(r) => r.generation && !r.generation.success,
	);

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

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${Math.round(remainingSeconds)}s`;
}

/**
 * Formats a number with thousands separators.
 */
function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

/**
 * Pads a string to a fixed width.
 */
function pad(str: string, width: number, align: "left" | "right" = "left"): string {
	if (align === "right") return str.padStart(width);
	return str.padEnd(width);
}

/**
 * Formats run statistics for terminal output.
 *
 * @param stats - Run statistics
 * @param runId - Run identifier
 * @param completed - Number of completed items
 * @param failed - Number of failed items
 * @param total - Total number of items
 * @param durationMs - Total run duration
 * @param outputDir - Output directory path
 * @returns Formatted string for terminal output
 */
export function formatRunStats(
	stats: RunStats,
	runId: string,
	completed: number,
	failed: number,
	total: number,
	durationMs: number,
	outputDir: string,
): string {
	const lines: string[] = [];

	// Header
	lines.push("");
	lines.push(`Run complete: ${runId}`);
	lines.push(`  Completed: ${completed}/${total}`);
	lines.push(`  Failed: ${failed}`);
	if (stats.generationFailures && stats.generationFailures.total > 0) {
		lines.push("  Failure breakdown:");
		for (const { type, count } of stats.generationFailures.byType) {
			lines.push(`    ${type}: ${count}`);
		}
	}
	lines.push(`  Duration: ${formatDuration(durationMs)}`);

	// Timing section
	lines.push("");
	lines.push("Timing");
	lines.push(`  Avg generation:    ${formatDuration(stats.timing.avgGenerationMs)}`);
	if (stats.timing.avgScoringMs !== null) {
		lines.push(`  Avg scoring:       ${formatDuration(stats.timing.avgScoringMs)}`);
	}
	if (stats.timing.avgFrontierEvalMs !== null) {
		lines.push(`  Avg frontier eval: ${formatDuration(stats.timing.avgFrontierEvalMs)}`);
	}
	lines.push(`  Generation range:  ${formatDuration(stats.timing.minGenerationMs)} - ${formatDuration(stats.timing.maxGenerationMs)}`);

	// Tokens section (if available)
	if (stats.tokens) {
		lines.push("");
		lines.push("Tokens");
		lines.push(`  Total prompt:      ${formatNumber(stats.tokens.totalPromptTokens)}`);
		lines.push(`  Total completion:  ${formatNumber(stats.tokens.totalCompletionTokens)}`);
		lines.push(`  Avg completion:    ${formatNumber(stats.tokens.avgCompletionTokens)}/item`);
		lines.push(`  Items with tokens: ${stats.tokens.itemsWithTokens}/${total}`);
	}

	// Scoring section (if available)
	if (stats.scoring) {
		lines.push("");
		lines.push("Scoring");
		lines.push(`  Pass rate: ${stats.scoring.passRate.toFixed(1)}% (${stats.scoring.totalPassed}/${stats.scoring.totalTests} tests)`);

		// By test breakdown (show all)
		if (stats.scoring.byTest.length > 1) {
			lines.push("  By test:");
			const maxNameLen = Math.max(...stats.scoring.byTest.map((t) => t.name.length));
			for (const t of stats.scoring.byTest) {
				lines.push(`    ${pad(t.name, maxNameLen)}  ${pad(t.passRate.toFixed(1) + "%", 6, "right")} (${t.passed}/${t.total})`);
			}
		}

		// By harness breakdown (show if > 1 harness)
		if (stats.scoring.byHarness.length > 1) {
			lines.push("  By harness:");
			const maxNameLen = Math.max(...stats.scoring.byHarness.map((h) => h.name.length));
			for (const h of stats.scoring.byHarness) {
				lines.push(`    ${pad(h.name, maxNameLen)}  ${pad(h.passRate.toFixed(1) + "%", 6, "right")} (${h.passed}/${h.total})`);
			}
		}

		// By model breakdown (show if > 1 model)
		if (stats.scoring.byModel.length > 1) {
			lines.push("  By model:");
			const maxNameLen = Math.min(25, Math.max(...stats.scoring.byModel.map((m) => m.name.length)));
			for (const m of stats.scoring.byModel) {
				const displayName = m.name.length > 25 ? m.name.slice(0, 24) + "…" : m.name;
				lines.push(`    ${pad(displayName, maxNameLen)}  ${pad(m.passRate.toFixed(1) + "%", 6, "right")} (${m.passed}/${m.total})`);
			}
		}
	}

	// Frontier eval section (if available)
	if (stats.frontier) {
		lines.push("");
		lines.push("Frontier Eval");
		lines.push(`  Avg score: ${stats.frontier.avgScore.toFixed(1)}/10 (${stats.frontier.itemCount} items)`);
		lines.push(`  Range: ${stats.frontier.minScore}/10 - ${stats.frontier.maxScore}/10`);

		// By harness breakdown (show if > 1 harness)
		if (stats.frontier.byHarness.length > 1) {
			lines.push("  By harness:");
			const maxNameLen = Math.max(...stats.frontier.byHarness.map((h) => h.name.length));
			for (const h of stats.frontier.byHarness) {
				lines.push(`    ${pad(h.name, maxNameLen)}  ${h.avgScore.toFixed(1)}/10 (${h.count})`);
			}
		}

		// By model breakdown (show if > 1 model)
		if (stats.frontier.byModel.length > 1) {
			lines.push("  By model:");
			const maxNameLen = Math.min(25, Math.max(...stats.frontier.byModel.map((m) => m.name.length)));
			for (const m of stats.frontier.byModel) {
				const displayName = m.name.length > 25 ? m.name.slice(0, 24) + "…" : m.name;
				lines.push(`    ${pad(displayName, maxNameLen)}  ${m.avgScore.toFixed(1)}/10 (${m.count})`);
			}
		}
	}

	// Results path
	lines.push("");
	lines.push(`Results: ${outputDir}/${runId}/`);
	lines.push("");

	return lines.join("\n");
}
