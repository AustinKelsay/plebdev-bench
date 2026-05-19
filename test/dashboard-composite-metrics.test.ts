/**
 * Purpose: Validate dashboard Composite Score coverage semantics.
 * Exports: none
 *
 * Invariants:
 * - Run-detail metrics may use observed group totals.
 * - Leaderboard metrics can score completion against expected comparison-space totals.
 */

import { describe, expect, it } from "vitest";
import {
	computeComparisonSpaceExpectedTotals,
	computeCompositeMetrics,
	groupByModel,
} from "../apps/dashboard/src/lib/aggregations.js";
import type { MatrixItemResult } from "../apps/dashboard/src/lib/types.js";

/**
 * Creates a completed dashboard matrix item.
 *
 * @param id - Matrix item ID
 * @param model - Runtime model name
 * @returns Matrix item with passing automated score
 */
function createCompletedItem(id: string, model: string): MatrixItemResult {
	return {
		id,
		runtime: "ollama",
		model,
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		automatedScore: {
			passed: 1,
			failed: 0,
			total: 1,
		},
	};
}

describe("computeCompositeMetrics", () => {
	it("uses observed totals by default for run-detail completion", () => {
		const metrics = computeCompositeMetrics(
			[createCompletedItem("01", "partial-model")],
			groupByModel,
		);

		expect(metrics[0]?.completedItems).toBe(1);
		expect(metrics[0]?.totalItems).toBe(1);
		expect(metrics[0]?.completionRate).toBe(1);
		expect(metrics[0]?.effectiveScore).toBe(1);
	});

	it("uses expected totals for leaderboard-scope completion coverage", () => {
		const metrics = computeCompositeMetrics(
			[createCompletedItem("01", "partial-model")],
			groupByModel,
			new Set(),
			{ expectedTotals: { "partial-model": 4 } },
		);

		expect(metrics[0]?.completedItems).toBe(1);
		expect(metrics[0]?.totalItems).toBe(4);
		expect(metrics[0]?.completionRate).toBe(0.25);
		expect(metrics[0]?.effectiveScore).toBe(0.775);
	});

	it("derives expected totals from the active Comparison Space", () => {
		const comparisonSpaceItems = [
			createCompletedItem("01", "complete-model"),
			createCompletedItem("02", "complete-model"),
			createCompletedItem("03", "complete-model"),
			createCompletedItem("04", "complete-model"),
			createCompletedItem("05", "partial-model"),
		];

		const expectedTotals = computeComparisonSpaceExpectedTotals(
			comparisonSpaceItems,
			groupByModel,
		);
		const metrics = computeCompositeMetrics(
			comparisonSpaceItems,
			groupByModel,
			new Set(),
			{ expectedTotals },
		);

		const partial = metrics.find((metric) => metric.name === "partial-model");

		expect(expectedTotals.get("partial-model")).toBe(4);
		expect(partial?.completedItems).toBe(1);
		expect(partial?.totalItems).toBe(4);
		expect(partial?.completionRate).toBe(0.25);
	});
});
