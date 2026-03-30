/**
 * Purpose: Aggregation helpers for test-type comparison charts.
 * Exports: TestTypeComparisonMetric, TestTypeComparisonCategory,
 *          TestTypeComparisonRow, TestTypeComparisonData,
 *          computeTestTypeComparisonData
 *
 * Invariants:
 * - Category order is stable for known types and deterministic for future types
 * - Model rows are sorted by specialization spread, then average pass rate
 * - Only items with automated scores contribute to pass-rate comparisons
 */

import { computePassRate } from "./aggregations-core";
import type { MatrixItemResult } from "./types";

/** Per-model metric for a single benchmark test type. */
export interface TestTypeComparisonMetric {
	category: string;
	passRate: number;
	passed: number;
	total: number;
	itemCount: number;
}

/** Category descriptor for test-type comparison charts. */
export interface TestTypeComparisonCategory {
	slug: string;
}

/** Per-model row for benchmark test-type comparison charts. */
export interface TestTypeComparisonRow {
	model: string;
	metrics: Record<string, TestTypeComparisonMetric>;
	averagePassRate: number;
	spread: number;
	bestCategory: string | null;
	worstCategory: string | null;
}

/** Full dataset for model-vs-test-type comparison charts. */
export interface TestTypeComparisonData {
	categories: TestTypeComparisonCategory[];
	rows: TestTypeComparisonRow[];
}

const KNOWN_TEST_TYPE_ORDER = ["coding", "computer-use"] as const;

/**
 * Returns the stable sort rank for a benchmark test type.
 *
 * @param category - Category slug from result items
 * @returns Numeric rank used for deterministic ordering
 */
function getCategoryOrderRank(category: string): number {
	const knownIndex = KNOWN_TEST_TYPE_ORDER.indexOf(
		category as (typeof KNOWN_TEST_TYPE_ORDER)[number],
	);
	if (knownIndex !== -1) return knownIndex;
	if (category === "uncategorized") return Number.MAX_SAFE_INTEGER;
	return KNOWN_TEST_TYPE_ORDER.length;
}

/**
 * Sorts benchmark test types for chart display.
 *
 * @param categories - Raw category slug set
 * @returns Sorted category descriptors
 */
function sortCategories(categories: Set<string>): TestTypeComparisonCategory[] {
	return [...categories]
		.sort((left, right) => {
			const leftRank = getCategoryOrderRank(left);
			const rightRank = getCategoryOrderRank(right);
			if (leftRank !== rightRank) return leftRank - rightRank;
			return left.localeCompare(right);
		})
		.map((slug) => ({ slug }));
}

/**
 * Computes per-model pass-rate splits across benchmark test types.
 *
 * @param items - Filtered matrix items
 * @returns Category list plus model rows sorted by specialization spread
 */
export function computeTestTypeComparisonData(
	items: MatrixItemResult[],
): TestTypeComparisonData {
	const categorizedItems = items.filter((item) => item.category !== undefined);
	const categories = sortCategories(
		new Set(categorizedItems.map((item) => item.category ?? "uncategorized")),
	);
	const modelMap = new Map<string, Map<string, MatrixItemResult[]>>();

	for (const item of categorizedItems) {
		const category = item.category ?? "uncategorized";
		if (!modelMap.has(item.model)) {
			modelMap.set(item.model, new Map());
		}
		const categoryMap = modelMap.get(item.model)!;
		if (!categoryMap.has(category)) {
			categoryMap.set(category, []);
		}
		categoryMap.get(category)!.push(item);
	}

	const rows: TestTypeComparisonRow[] = [];
	for (const [model, categoryMap] of modelMap) {
		const metrics: Record<string, TestTypeComparisonMetric> = {};
		const passRates: Array<{ category: string; passRate: number }> = [];

		for (const category of categories) {
			const categoryItems = categoryMap.get(category.slug) ?? [];
			const { passRate, passed, total } = computePassRate(categoryItems);
			if (total === 0) continue;

			metrics[category.slug] = {
				category: category.slug,
				passRate,
				passed,
				total,
				itemCount: categoryItems.length,
			};
			passRates.push({ category: category.slug, passRate });
		}

		if (passRates.length === 0) continue;

		const sortedPassRates = [...passRates].sort((left, right) => {
			if (right.passRate !== left.passRate) {
				return right.passRate - left.passRate;
			}
			return left.category.localeCompare(right.category);
		});
		const averagePassRate =
			passRates.reduce((sum, entry) => sum + entry.passRate, 0) /
			passRates.length;
		const bestCategory = sortedPassRates[0]?.category ?? null;
		const worstCategory =
			sortedPassRates[sortedPassRates.length - 1]?.category ?? null;
		const spread =
			sortedPassRates.length > 1
				? sortedPassRates[0].passRate -
					sortedPassRates[sortedPassRates.length - 1].passRate
				: 0;

		rows.push({
			model,
			metrics,
			averagePassRate,
			spread,
			bestCategory,
			worstCategory,
		});
	}

	return {
		categories,
		rows: rows.sort((left, right) => {
			if (right.spread !== left.spread) return right.spread - left.spread;
			if (right.averagePassRate !== left.averagePassRate) {
				return right.averagePassRate - left.averagePassRate;
			}
			return left.model.localeCompare(right.model);
		}),
	};
}
