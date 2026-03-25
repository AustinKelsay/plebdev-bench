/**
 * Purpose: Validate dashboard-side compare summary aggregation.
 * Exports: none
 *
 * Invariants:
 * - Dashboard scoring/frontier deltas use only matched rows with both metrics
 * - Missing metrics reduce coverage counts without distorting deltas
 */

import { describe, expect, it } from "vitest";
import { compareRuns } from "../apps/dashboard/src/lib/aggregations-compare.js";

describe("compareRuns", () => {
	it("computes scoring and frontier deltas from matched metric subsets only", () => {
		const result = compareRuns(
			{
				runId: "run-a",
				startedAt: "2026-03-25T12:00:00.000Z",
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "qwen3:8b",
						harness: "direct",
						test: "smoke",
						passType: "blind",
						status: "completed",
						automatedScore: { passed: 6, failed: 0, total: 6 },
						frontierEval: { score: 7, reasoning: "ok", model: "grader" },
					},
					{
						id: "02",
						runtime: "ollama",
						model: "qwen3:8b",
						harness: "direct",
						test: "extra",
						passType: "blind",
						status: "completed",
						automatedScore: { passed: 0, failed: 6, total: 6 },
					},
				],
			},
			{
				runId: "run-b",
				startedAt: "2026-03-25T12:10:00.000Z",
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "qwen3:8b",
						harness: "direct",
						test: "smoke",
						passType: "blind",
						status: "completed",
						automatedScore: { passed: 3, failed: 3, total: 6 },
						frontierEval: { score: 9, reasoning: "better", model: "grader" },
					},
					{
						id: "02",
						runtime: "ollama",
						model: "qwen3:8b",
						harness: "direct",
						test: "extra",
						passType: "blind",
						status: "completed",
					},
				],
			},
		);

		expect(result.summary.metricAvailability.scoring.comparedRows).toBe(1);
		expect(result.summary.metricAvailability.frontierEval.comparedRows).toBe(1);
		expect(result.summary.scoringDelta?.passRateDelta).toBe(-0.5);
		expect(result.summary.frontierEvalDelta?.avgScoreDelta).toBe(2);
	});
});
