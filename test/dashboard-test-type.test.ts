/**
 * Purpose: Validate dashboard test-type grouping and leaderboard filtering.
 * Exports: none
 *
 * Invariants:
 * - Test-type aggregation groups rows by benchmark category metadata
 * - Leaderboard filtering can isolate a single benchmark category without touching result data
 */

import { describe, expect, it } from "vitest";
import {
	createDefaultFilterState,
	filterItems,
} from "../apps/dashboard/src/components/leaderboard/leaderboard-filters.js";
import {
	computeBreakdown,
	computeTestTypeComparisonData,
	groupByTestType,
} from "../apps/dashboard/src/lib/aggregations.js";
import type {
	LeaderboardAggregatedItem,
	MatrixItemResult,
} from "../apps/dashboard/src/lib/types.js";
import { formatTestCategoryLabel } from "../apps/dashboard/src/lib/utils.js";

/**
 * Creates a minimal matrix item for dashboard aggregation tests.
 *
 * @param overrides - Item fields to override in the baseline fixture
 * @returns Matrix item result with deterministic defaults
 */
function createMatrixItem(
	overrides: Partial<MatrixItemResult> = {},
): MatrixItemResult {
	return {
		id: "item-1",
		runtime: "ollama",
		model: "qwen3:8b",
		harness: "direct",
		test: "smoke",
		category: "coding",
		passType: "blind",
		status: "completed",
		automatedScore: {
			passed: 1,
			failed: 0,
			total: 1,
		},
		...overrides,
	};
}

/**
 * Creates a leaderboard aggregate item for filter-state tests.
 *
 * @param overrides - Item fields to override in the baseline fixture
 * @returns Aggregate item with deterministic machine metadata
 */
function createLeaderboardItem(
	overrides: Partial<LeaderboardAggregatedItem> = {},
): LeaderboardAggregatedItem {
	return {
		...createMatrixItem(),
		machineProfileKey: "mac-mini-m4",
		machineProfileLabel: "Mac mini M4",
		verificationStatus: "self_reported",
		sourceRunId: "run-1",
		sourceCompletedAt: "2026-03-30T12:00:00.000Z",
		...overrides,
	};
}

describe("dashboard test-type views", () => {
	it("groups pass-rate breakdowns by benchmark category", () => {
		const items = [
			createMatrixItem({
				id: "coding-pass",
				category: "coding",
				test: "calculator-basic",
			}),
			createMatrixItem({
				id: "computer-fail",
				category: "computer-use",
				test: "workspace-smoke",
				automatedScore: {
					passed: 0,
					failed: 1,
					total: 1,
				},
			}),
			createMatrixItem({
				id: "uncategorized-pass",
				category: undefined,
				test: "legacy-test",
			}),
		];

		const breakdown = computeBreakdown(items, groupByTestType);

		expect(breakdown.map((row) => row.name)).toEqual([
			"coding",
			"uncategorized",
			"computer-use",
		]);
		expect(formatTestCategoryLabel(breakdown[2]?.name ?? "")).toBe(
			"Computer Use",
		);
	});

	it("filters leaderboard items by test type", () => {
		const items = [
			createLeaderboardItem({
				id: "coding-row",
				test: "calculator-basic",
				category: "coding",
			}),
			createLeaderboardItem({
				id: "computer-row",
				test: "workspace-smoke",
				category: "computer-use",
			}),
			createLeaderboardItem({
				id: "legacy-row",
				test: "legacy-test",
				category: undefined,
			}),
		];

		const filters = {
			...createDefaultFilterState(),
			testType: "computer-use",
		};

		expect(filterItems(items, filters).map((item) => item.id)).toEqual([
			"computer-row",
		]);
	});

	it("computes per-model test-type spread for specialization charts", () => {
		const items = [
			createMatrixItem({
				id: "specialist-coding",
				model: "specialist",
				category: "coding",
				test: "calculator-basic",
				automatedScore: { passed: 1, failed: 0, total: 1 },
			}),
			createMatrixItem({
				id: "specialist-computer",
				model: "specialist",
				category: "computer-use",
				test: "workspace-smoke",
				automatedScore: { passed: 0, failed: 1, total: 1 },
			}),
			createMatrixItem({
				id: "balanced-coding",
				model: "balanced",
				category: "coding",
				test: "calculator-basic",
				automatedScore: { passed: 1, failed: 0, total: 2 },
			}),
			createMatrixItem({
				id: "balanced-computer",
				model: "balanced",
				category: "computer-use",
				test: "workspace-smoke",
				automatedScore: { passed: 1, failed: 0, total: 2 },
			}),
		];

		const result = computeTestTypeComparisonData(items);

		expect(result.categories.map((category) => category.slug)).toEqual([
			"coding",
			"computer-use",
		]);
		expect(result.rows[0]?.model).toBe("specialist");
		expect(result.rows[0]?.bestCategory).toBe("coding");
		expect(result.rows[0]?.worstCategory).toBe("computer-use");
		expect(result.rows[0]?.spread).toBe(1);
		expect(result.rows[1]?.model).toBe("balanced");
	});
});
