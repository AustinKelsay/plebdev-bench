/**
 * Purpose: Verify leaderboard-specific dashboard aggregations stay deterministic.
 * Exports: none
 *
 * Invariants:
 * - Model insights rank by benchmark strength first
 * - Heatmap ordering keeps the hardest tests first for UI legibility
 */

import { describe, expect, it } from "vitest";
import {
	computeBenchmarkHeatmap,
	computeModelInsights,
	computePromptLiftRows,
} from "../apps/dashboard/src/lib/aggregations-leaderboard.js";
import type { MatrixItemResult } from "../apps/dashboard/src/lib/types.js";

function createItem(
	overrides: Partial<MatrixItemResult>,
): MatrixItemResult {
	return {
		id: "item",
		runtime: "ollama",
		model: "model-a",
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		automatedScore: {
			passed: 1,
			failed: 0,
			total: 1,
		},
		generation: {
			success: true,
			output: "export const ok = true;",
			durationMs: 2_000,
		},
		...overrides,
	};
}

describe("dashboard leaderboard aggregations", () => {
	it("computes model insights and prompt lift from filtered items", () => {
		const items: MatrixItemResult[] = [
			createItem({
				id: "a-blind-smoke",
				model: "model-a",
				test: "smoke",
				passType: "blind",
			}),
			createItem({
				id: "a-informed-smoke",
				model: "model-a",
				test: "smoke",
				passType: "informed",
			}),
			createItem({
				id: "a-blind-hard",
				model: "model-a",
				test: "hard",
				passType: "blind",
				automatedScore: { passed: 0, failed: 1, total: 1 },
			}),
			createItem({
				id: "a-informed-hard",
				model: "model-a",
				test: "hard",
				passType: "informed",
			}),
			createItem({
				id: "b-blind-smoke",
				model: "model-b",
				test: "smoke",
				passType: "blind",
				automatedScore: { passed: 0, failed: 1, total: 1 },
				status: "failed",
				generationFailure: {
					type: "unknown",
					message: "failure",
				},
			}),
			createItem({
				id: "b-informed-smoke",
				model: "model-b",
				test: "smoke",
				passType: "informed",
				automatedScore: { passed: 0, failed: 1, total: 1 },
			}),
		];

		const insights = computeModelInsights(items);
		const promptLift = computePromptLiftRows(items);
		const heatmap = computeBenchmarkHeatmap(items, 2);

		expect(insights.map((insight) => insight.name)).toEqual([
			"model-a",
			"model-b",
		]);
		expect(insights[0]?.passRate).toBeCloseTo(0.75);
		expect(insights[0]?.informedLift).toBeCloseTo(0.5);
		expect(insights[1]?.completionRate).toBeCloseTo(0.5);

		expect(promptLift[0]?.name).toBe("model-a");
		expect(promptLift[0]?.lift).toBeCloseTo(0.5);

		expect(heatmap.tests).toEqual(["hard", "smoke"]);
		expect(heatmap.rows[0]?.cells[0]?.passRate).toBeCloseTo(0.5);
	});
});
