/**
 * Purpose: Validate leaderboard Model Profile grouping with Model Variant drilldown.
 * Exports: none
 *
 * Invariants:
 * - Leaderboard grouping defaults to canonical Model Profile identity.
 * - Runtime-specific Model Variant metadata remains filterable and inspectable.
 */

import { describe, expect, it } from "vitest";
import {
	buildModelVariantFilterOptions,
	createDefaultFilterState,
	filterItems,
} from "../apps/dashboard/src/components/leaderboard/leaderboard-filters.js";
import { groupByModel } from "../apps/dashboard/src/lib/aggregations.js";
import type { LeaderboardAggregatedItem } from "../apps/dashboard/src/lib/types.js";

function createVariantItem(
	id: string,
	model: string,
	variantKey: string,
	quantization: string,
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
				parametersBillions: 27,
			},
			variant: {
				variantKey,
				variantLabel: model,
				runtime: "ollama",
				runtimeModelName: model,
				quantization,
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

describe("leaderboard model variant semantics", () => {
	it("groups by Model Profile while preserving variant filters", () => {
		const items = [
			createVariantItem(
				"item-1",
				"qwen3:27b-q4",
				"ollama-qwen3-27b-q4",
				"Q4_K_M",
			),
			createVariantItem(
				"item-2",
				"qwen3:27b-q6",
				"ollama-qwen3-27b-q6",
				"Q6_K",
			),
		];

		const grouped = groupByModel(items);
		const variants = buildModelVariantFilterOptions(items);
		const q4Items = filterItems(items, {
			...createDefaultFilterState(),
			modelVariant: "ollama-qwen3-27b-q4",
		});
		const q6Items = filterItems(items, {
			...createDefaultFilterState(),
			modelQuantization: "Q6_K",
		});

		expect([...grouped.keys()]).toEqual(["Qwen 3 27B Instruct"]);
		expect(grouped.get("Qwen 3 27B Instruct")).toHaveLength(2);
		expect(variants.map((option) => option.value)).toEqual([
			"ollama-qwen3-27b-q4",
			"ollama-qwen3-27b-q6",
		]);
		expect(q4Items.map((item) => item.model)).toEqual(["qwen3:27b-q4"]);
		expect(q6Items.map((item) => item.model)).toEqual(["qwen3:27b-q6"]);
	});
});
