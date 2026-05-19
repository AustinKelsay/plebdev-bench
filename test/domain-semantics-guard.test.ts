/**
 * Purpose: Guard critical domain semantics across compare and dashboard surfaces.
 * Exports: none
 *
 * Invariants:
 * - Model Profile is the default leaderboard grouping identity.
 * - Model Variant remains the concrete executable identity for filtering and comparisons.
 * - Leaderboard completion and run comparison report coverage gaps explicitly.
 */

import { describe, expect, it } from "vitest";
import {
	createDefaultFilterState,
	filterItems,
} from "../apps/dashboard/src/components/leaderboard/leaderboard-filters.js";
import {
	computeComparisonSpaceExpectedTotals,
	computeCompositeMetrics,
	groupByModel,
} from "../apps/dashboard/src/lib/aggregations.js";
import type { LeaderboardAggregatedItem } from "../apps/dashboard/src/lib/types.js";
import { compareRuns } from "../src/results/compare.js";
import type { MatrixItemResult, RunResult } from "../src/schemas/index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

function createDashboardItem(
	id: string,
	model: string,
	variantKey: string,
): LeaderboardAggregatedItem {
	return {
		id,
		runtime: "ollama",
		model,
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		machineProfileKey: "mac-studio",
		verificationStatus: "verified",
		sourceRunId: "run-1",
		sourceCompletedAt: "2026-05-19T12:00:00.000Z",
		modelProfile: {
			canonical: {
				profileKey: "qwen3-27b-instruct",
				profileLabel: "Qwen 3 27B Instruct",
				family: "qwen3",
			},
			variant: {
				variantKey,
				variantLabel: model,
				runtime: "ollama",
				runtimeModelName: model,
			},
			resolutionSource: "configured_profile",
		},
		automatedScore: {
			passed: 1,
			failed: 0,
			total: 1,
		},
	};
}

function createRunResult(runId: string, items: MatrixItemResult[]): RunResult {
	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		startedAt: "2026-05-19T12:00:00.000Z",
		completedAt: "2026-05-19T12:01:00.000Z",
		durationMs: 60_000,
		summary: {
			total: items.length,
			completed: items.length,
			failed: 0,
			pending: 0,
		},
		items,
	};
}

function createRunItem(
	id: string,
	model: string,
	variantKey: string,
): MatrixItemResult {
	return {
		id,
		runtime: "ollama",
		model,
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		modelProfile: {
			canonical: {
				profileKey: "qwen3-27b-instruct",
				profileLabel: "Qwen 3 27B Instruct",
				family: "qwen3",
			},
			variant: {
				variantKey,
				variantLabel: model,
				runtime: "ollama",
				runtimeModelName: model,
			},
			resolutionSource: "configured_profile",
		},
	};
}

describe("domain semantics guard", () => {
	it("keeps profile grouping, variant filtering, and coverage semantics distinct", () => {
		const q4 = createDashboardItem(
			"dashboard-1",
			"qwen3:27b-q4",
			"ollama-qwen3-27b-q4",
		);
		const q6 = createDashboardItem(
			"dashboard-2",
			"qwen3:27b-q6",
			"ollama-qwen3-27b-q6",
		);
		const dashboardItems = [q4, q6];

		const grouped = groupByModel(dashboardItems);
		const filtered = filterItems(dashboardItems, {
			...createDefaultFilterState(),
			modelVariant: "ollama-qwen3-27b-q4",
		});
		const expectedTotals = computeComparisonSpaceExpectedTotals(
			[q4, q6, q6],
			groupByModel,
		);
		const metrics = computeCompositeMetrics([q4], groupByModel, new Set(), {
			expectedTotals,
		});
		const comparison = compareRuns(
			createRunResult("full", [
				createRunItem("run-1", "qwen3:27b-q4", "ollama-qwen3-27b-q4"),
				createRunItem("run-2", "qwen3:27b-q6", "ollama-qwen3-27b-q6"),
			]),
			createRunResult("partial", [
				createRunItem("run-1", "qwen3:27b-q4", "ollama-qwen3-27b-q4"),
			]),
		);

		expect([...grouped.keys()]).toEqual(["Qwen 3 27B Instruct"]);
		expect(filtered.map((item) => item.model)).toEqual(["qwen3:27b-q4"]);
		expect(metrics[0]?.completionRate).toBe(1 / 3);
		expect(comparison.summary.coverage).toEqual({
			comparisonSpaceItems: 2,
			matchedItems: 1,
			unmatchedItems: 1,
			matchedCoverageRate: 0.5,
		});
	});
});
