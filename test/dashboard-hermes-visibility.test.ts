/**
 * Purpose: Verify dashboard public helpers expose Hermes as a first-class harness.
 * Exports: none
 *
 * Invariants:
 * - Hermes rows are filterable and visually distinct from other harnesses.
 * - Existing non-Hermes rows remain visible when no Hermes data is present.
 */

import { describe, expect, it } from "vitest";
import {
	ALL_FILTER_VALUE,
	createDefaultFilterState,
	filterItems,
	uniqueValues,
} from "../apps/dashboard/src/components/leaderboard/leaderboard-filters.js";
import {
	CHART_COLORS,
	HARNESS_COLORS,
	getHarnessColor,
} from "../apps/dashboard/src/lib/chart-colors.js";
import type { LeaderboardAggregatedItem } from "../apps/dashboard/src/lib/types.js";

function buildAggregateItem(
	harness: string,
	overrides: Partial<LeaderboardAggregatedItem> = {},
): LeaderboardAggregatedItem {
	return {
		id: `item-${harness}`,
		machineProfileKey: "macos_arm64_m4_pro",
		machineProfileLabel: "Apple M4 Pro",
		verificationStatus: "self_reported",
		sourceRunId: `run-${harness}`,
		sourceCompletedAt: "2026-06-19T14:00:00.000Z",
		runtime: "ollama",
		model: "qwen3.6:35b",
		modelAlias: "qwen3.6:35b",
		harness,
		test: "smoke",
		category: "coding",
		passType: "blind",
		status: "completed",
		...overrides,
	};
}

describe("dashboard Hermes visibility", () => {
	it("assigns Hermes a distinct known harness chart color", () => {
		expect(HARNESS_COLORS.hermes).toBeDefined();
		expect(getHarnessColor("hermes")).toBe(HARNESS_COLORS.hermes);
		expect(getHarnessColor("hermes")).not.toBe(CHART_COLORS.muted);
		expect(getHarnessColor("hermes")).not.toBe(getHarnessColor("direct"));
		expect(getHarnessColor("hermes")).not.toBe(getHarnessColor("goose"));
		expect(getHarnessColor("hermes")).not.toBe(getHarnessColor("opencode"));
	});

	it("keeps Hermes rows grouped and filterable by harness", () => {
		const items = [
			buildAggregateItem("direct"),
			buildAggregateItem("hermes", { test: "workspace-tool-smoke" }),
			buildAggregateItem("opencode"),
		];

		expect(uniqueValues(items, (item) => item.harness)).toEqual([
			"direct",
			"hermes",
			"opencode",
		]);
		expect(
			filterItems(items, {
				...createDefaultFilterState(),
				harness: "hermes",
			}).map((item) => item.harness),
		).toEqual(["hermes"]);
		expect(
			filterItems(items, {
				...createDefaultFilterState(),
				harness: ALL_FILTER_VALUE,
			}),
		).toHaveLength(3);
	});
});
