/**
 * Purpose: Aggregation functions for new dashboard charts.
 * Exports: computeModelTestMatrix, computeModelRadarData, computeTokenEfficiencyData,
 *          computeFailureBreakdownByModel, computeTestDifficultyData,
 *          computeHeadToHeadData, inferModelSizeBucket
 *
 * Invariants:
 * - All functions accept MatrixItemResult[] and return chart-ready data
 * - Zero-length inputs produce empty arrays (never null)
 */

import { computeItemPassRate, computePassRate } from "./aggregations-core";
import { inferToolHarnesses } from "./aggregations-tooling";
import type { MatrixItemResult } from "./types";
import { TOOL_SMOKE_TEST_SLUG } from "./types";

/** Cell for model x test heatmap. */
export interface HeatmapCell {
	model: string;
	test: string;
	passRate: number;
	passed: number;
	total: number;
	count: number;
}

/** Full heatmap data. */
export interface HeatmapData {
	models: string[];
	tests: string[];
	cells: HeatmapCell[];
}

/**
 * Computes a model x test pass-rate matrix for the heatmap chart.
 *
 * @param items - Filtered matrix items
 * @returns Sorted models, tests, and cell data
 */
export function computeModelTestMatrix(items: MatrixItemResult[]): HeatmapData {
	const nonToolSmoke = items.filter((i) => i.test !== TOOL_SMOKE_TEST_SLUG);
	const modelMap = new Map<string, Map<string, MatrixItemResult[]>>();

	for (const item of nonToolSmoke) {
		if (!modelMap.has(item.model)) modelMap.set(item.model, new Map());
		const testMap = modelMap.get(item.model)!;
		if (!testMap.has(item.test)) testMap.set(item.test, []);
		testMap.get(item.test)!.push(item);
	}

	const cells: HeatmapCell[] = [];
	const modelPassRates = new Map<string, number>();
	const testFailRates = new Map<string, number>();

	for (const [model, testMap] of modelMap) {
		let totalPassed = 0;
		let totalTests = 0;
		for (const [test, testItems] of testMap) {
			const pr = computePassRate(testItems);
			cells.push({
				model,
				test,
				passRate: pr.passRate,
				passed: pr.passed,
				total: pr.total,
				count: testItems.length,
			});
			totalPassed += pr.passed;
			totalTests += pr.total;
		}
		modelPassRates.set(model, totalTests > 0 ? totalPassed / totalTests : 0);
	}

	// Compute test difficulty (failure rate)
	const testGroups = new Map<string, MatrixItemResult[]>();
	for (const item of nonToolSmoke) {
		if (!testGroups.has(item.test)) testGroups.set(item.test, []);
		testGroups.get(item.test)!.push(item);
	}
	for (const [test, testItems] of testGroups) {
		const pr = computePassRate(testItems);
		testFailRates.set(test, 1 - pr.passRate);
	}

	const models = [...modelPassRates.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([m]) => m);
	const tests = [...testFailRates.entries()]
		.sort((a, b) => a[1] - b[1])
		.map(([t]) => t);

	return { models, tests, cells };
}

/** Radar data point for a single model. */
export interface RadarDataPoint {
	axis: string;
	fullMark: number;
	[modelKey: string]: string | number;
}

/**
 * Computes radar chart data for selected models.
 *
 * @param items - All matrix items
 * @param selectedModels - Models to compare (2-5)
 * @returns Array of radar axis data points
 */
export function computeModelRadarData(
	items: MatrixItemResult[],
	selectedModels: string[],
): RadarDataPoint[] {
	const toolHarnesses = inferToolHarnesses(items);
	const axes = ["Pass Rate", "Completion", "Tool Success", "Frontier", "Speed"];
	const radarData: RadarDataPoint[] = axes.map((axis) => ({
		axis,
		fullMark: 100,
	}));

	for (const model of selectedModels) {
		const modelItems = items.filter((i) => i.model === model);
		const nonToolSmoke = modelItems.filter(
			(i) => i.test !== TOOL_SMOKE_TEST_SLUG,
		);
		const pr = computePassRate(nonToolSmoke);
		const completed = modelItems.filter((i) => i.status === "completed").length;
		const completionRate =
			modelItems.length > 0 ? (completed / modelItems.length) * 100 : 0;

		const toolItems = modelItems.filter((i) => toolHarnesses.has(i.harness));
		const toolMissing = toolItems.filter((i) => {
			const ft = i.generationFailure?.type ?? i.generation?.failureType;
			return ft === "tool_missing";
		}).length;
		const toolSuccess =
			toolItems.length > 0
				? ((toolItems.length - toolMissing) / toolItems.length) * 100
				: 100;

		const frontierScores = modelItems
			.map((i) => i.frontierEval?.score)
			.filter((s): s is number => s !== undefined);
		const frontierAvg =
			frontierScores.length > 0
				? (frontierScores.reduce((a, b) => a + b, 0) /
						frontierScores.length /
						10) *
					100
				: 0;

		const durations = modelItems
			.map((i) => i.generation?.durationMs)
			.filter((d): d is number => d !== undefined);
		// Speed: inverse of duration, normalized. Lower duration = higher speed score.
		const avgDuration =
			durations.length > 0
				? durations.reduce((a, b) => a + b, 0) / durations.length
				: 0;
		// Normalize: 0ms = 100, 300s = 0
		// Normalize: 0ms = 100, 300_000ms (5min) = 0
		const speedScore = avgDuration > 0 ? Math.max(0, 100 - (avgDuration / 300_000) * 100) : 50;

		const values = [pr.passRate * 100, completionRate, toolSuccess, frontierAvg, speedScore];
		for (let i = 0; i < axes.length; i++) {
			radarData[i][model] = Math.round(values[i] * 10) / 10;
		}
	}

	return radarData;
}

/** Token efficiency data point for scatter chart. */
export interface TokenEfficiencyPoint {
	model: string;
	avgTokens: number;
	passRate: number;
	itemCount: number;
	harness: string;
}

/**
 * Computes token efficiency scatter data (tokens vs pass rate).
 *
 * @param items - Matrix items
 * @returns Scatter points per model+harness
 */
export function computeTokenEfficiencyData(
	items: MatrixItemResult[],
): TokenEfficiencyPoint[] {
	const groups = new Map<string, MatrixItemResult[]>();
	for (const item of items) {
		if (item.test === TOOL_SMOKE_TEST_SLUG) continue;
		const key = `${item.model}|||${item.harness}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(item);
	}

	const points: TokenEfficiencyPoint[] = [];
	for (const [key, groupItems] of groups) {
		const [model, harness] = key.split("|||");
		const tokens = groupItems
			.map((i) => i.generation?.completionTokens)
			.filter((t): t is number => t !== undefined);
		if (tokens.length === 0) continue;

		const avgTokens = tokens.reduce((a, b) => a + b, 0) / tokens.length;
		const pr = computePassRate(groupItems);
		points.push({
			model,
			harness,
			avgTokens: Math.round(avgTokens),
			passRate: pr.passRate * 100,
			itemCount: groupItems.length,
		});
	}

	return points;
}

/** Failure breakdown row for stacked bar chart. */
export interface FailureBreakdownRow {
	name: string;
	timeout: number;
	import: number;
	missing_export: number;
	harness_error: number;
	factory_init_failed: number;
	other: number;
	total: number;
}

/**
 * Computes failure type breakdown by model or harness.
 *
 * @param items - Matrix items
 * @param groupBy - "model" or "harness"
 * @returns Stacked bar rows sorted by total failures descending
 */
export function computeFailureBreakdownByModel(
	items: MatrixItemResult[],
	groupBy: "model" | "harness" = "model",
): FailureBreakdownRow[] {
	const groups = new Map<string, MatrixItemResult[]>();
	for (const item of items) {
		const key = groupBy === "model" ? item.model : item.harness;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(item);
	}

	const KNOWN_TYPES = [
		"timeout",
		"import",
		"missing_export",
		"harness_error",
		"factory_init_failed",
	] as const;

	const rows: FailureBreakdownRow[] = [];
	for (const [name, groupItems] of groups) {
		const counts: Record<string, number> = {};
		for (const t of KNOWN_TYPES) counts[t] = 0;
		counts.other = 0;

		for (const item of groupItems) {
			const failType =
				item.generationFailure?.type ?? item.scoringFailure?.type;
			if (!failType) continue;
			if (KNOWN_TYPES.includes(failType as (typeof KNOWN_TYPES)[number])) {
				counts[failType] = (counts[failType] || 0) + 1;
			} else {
				counts.other += 1;
			}
		}

		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		if (total === 0) continue;

		rows.push({
			name,
			timeout: counts.timeout,
			import: counts.import,
			missing_export: counts.missing_export,
			harness_error: counts.harness_error,
			factory_init_failed: counts.factory_init_failed,
			other: counts.other,
			total,
		});
	}

	return rows.sort((a, b) => b.total - a.total);
}

/** Test difficulty data point. */
export interface TestDifficultyRow {
	test: string;
	failureRate: number;
	total: number;
	small: number;
	medium: number;
	large: number;
}

/**
 * Infers model size bucket from model name heuristic.
 *
 * @param model - Model name string
 * @returns "small" | "medium" | "large"
 */
export function inferModelSizeBucket(model: string): "small" | "medium" | "large" {
	const lower = model.toLowerCase();
	// Check for common size indicators
	if (/\b(1b|3b|7b|8b|1\.5b|0\.5b|tiny|mini|small|nano|phi-2)\b/.test(lower))
		return "small";
	if (/\b(70b|72b|90b|405b|large|xl|xxl)\b/.test(lower)) return "large";
	return "medium";
}

/**
 * Computes test difficulty ranking data.
 *
 * @param items - Matrix items
 * @returns Rows sorted by failure rate descending (hardest first)
 */
export function computeTestDifficultyData(
	items: MatrixItemResult[],
): TestDifficultyRow[] {
	const nonToolSmoke = items.filter((i) => i.test !== TOOL_SMOKE_TEST_SLUG);
	const testGroups = new Map<string, MatrixItemResult[]>();
	for (const item of nonToolSmoke) {
		if (!testGroups.has(item.test)) testGroups.set(item.test, []);
		testGroups.get(item.test)!.push(item);
	}

	const rows: TestDifficultyRow[] = [];
	for (const [test, testItems] of testGroups) {
		const pr = computePassRate(testItems);
		const failureRate = 1 - pr.passRate;

		const bucketCounts = { small: 0, medium: 0, large: 0 };
		for (const item of testItems) {
			if (!item.automatedScore) continue;
			const itemPr = computeItemPassRate(item.automatedScore);
			if (itemPr < 1) {
				const bucket = inferModelSizeBucket(item.model);
				bucketCounts[bucket]++;
			}
		}

		rows.push({
			test,
			failureRate,
			total: pr.total,
			...bucketCounts,
		});
	}

	return rows.sort((a, b) => b.failureRate - a.failureRate);
}

/** Head-to-head comparison bar data. */
export interface HeadToHeadRow {
	test: string;
	modelAScore: number;
	modelBScore: number;
	delta: number;
}

/**
 * Computes head-to-head comparison data for two models.
 *
 * @param items - Matrix items
 * @param modelA - First model name
 * @param modelB - Second model name
 * @returns Diverging bar data per test
 */
export function computeHeadToHeadData(
	items: MatrixItemResult[],
	modelA: string,
	modelB: string,
): HeadToHeadRow[] {
	const nonToolSmoke = items.filter((i) => i.test !== TOOL_SMOKE_TEST_SLUG);
	const tests = [...new Set(nonToolSmoke.map((i) => i.test))];

	const rows: HeadToHeadRow[] = [];
	for (const test of tests) {
		const aItems = nonToolSmoke.filter(
			(i) => i.model === modelA && i.test === test,
		);
		const bItems = nonToolSmoke.filter(
			(i) => i.model === modelB && i.test === test,
		);

		const aPr = computePassRate(aItems);
		const bPr = computePassRate(bItems);

		if (aPr.total === 0 && bPr.total === 0) continue;

		rows.push({
			test,
			modelAScore: aPr.passRate * 100,
			modelBScore: bPr.passRate * 100,
			delta: (aPr.passRate - bPr.passRate) * 100,
		});
	}

	return rows.sort((a, b) => b.delta - a.delta);
}
