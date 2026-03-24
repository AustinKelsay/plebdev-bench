/**
 * Purpose: Ensure compare output is deterministic regardless of input order.
 */

import { describe, expect, it } from "vitest";
import { compareRuns } from "../src/results/compare.js";
import type { MatrixItemResult, RunResult } from "../src/schemas/index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

function buildRun(runId: string, items: MatrixItemResult[]): RunResult {
	const completed = items.filter((item) => item.status === "completed").length;
	const failed = items.filter((item) => item.status === "failed").length;

	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		startedAt: "2026-01-14T14:30:52.000Z",
		completedAt: "2026-01-14T14:40:52.000Z",
		durationMs: 600_000,
		summary: {
			total: items.length,
			completed,
			failed,
			pending: 0,
		},
		items,
	};
}

function buildItem(
	id: string,
	test: string,
	passType: "blind" | "informed",
	durationMs: number,
): MatrixItemResult {
	return {
		id,
		runtime: "ollama",
		model: "llama3.2:3b",
		harness: "direct",
		test,
		passType,
		status: "completed",
		generation: {
			success: true,
			output: "code here",
			durationMs,
		},
	};
}

describe("compareRuns", () => {
	it("should return deterministic ordering for matched and exclusive items", () => {
		const itemBlind = buildItem("01", "smoke", "blind", 1000);
		const itemInformed = buildItem("02", "smoke", "informed", 1200);
		const itemOnlyInA = buildItem("03", "todo-app", "blind", 1500);
		const itemOnlyInB = buildItem("04", "calculator-basic", "blind", 900);

		const runA = buildRun("run-a", [itemInformed, itemOnlyInA, itemBlind]);
		const runB = buildRun("run-b", [itemOnlyInB, itemBlind, itemInformed]);

		const comparison1 = compareRuns(runA, runB);
		const comparison2 = compareRuns(
			buildRun("run-a", [itemBlind, itemOnlyInA, itemInformed]),
			runB,
		);

		const matchedKeys = comparison1.matched.map((m) => m.key);
		expect(matchedKeys).toEqual([
			"llama3.2:3b|direct|smoke|blind",
			"llama3.2:3b|direct|smoke|informed",
		]);

		const onlyInAKeys = comparison1.onlyInA.map(
			(item) => `${item.model}|${item.harness}|${item.test}|${item.passType}`,
		);
		const onlyInBKeys = comparison1.onlyInB.map(
			(item) => `${item.model}|${item.harness}|${item.test}|${item.passType}`,
		);

		expect(onlyInAKeys).toEqual(["llama3.2:3b|direct|todo-app|blind"]);
		expect(onlyInBKeys).toEqual(["llama3.2:3b|direct|calculator-basic|blind"]);
		expect(comparison2.matched.map((m) => m.key)).toEqual(matchedKeys);
		expect(comparison2.onlyInA.map((item) => item.test)).toEqual(["todo-app"]);
	});

	it("separates raw deltas from trusted deltas when runs include tainted rows", () => {
		const runA = buildRun("run-a", [
			{
				...buildItem("01", "smoke", "blind", 1000),
				automatedScore: { passed: 5, failed: 5, total: 10 },
				signalAssessment: {
					classification: "trustworthy",
					reasons: [],
				},
			},
			{
				...buildItem("02", "todo-app", "blind", 1000),
				automatedScore: { passed: 0, failed: 10, total: 10 },
				signalAssessment: {
					classification: "tainted",
					reasons: ["tool_permission_denied"],
				},
			},
		]);
		const runB = buildRun("run-b", [
			{
				...buildItem("01", "smoke", "blind", 900),
				automatedScore: { passed: 7, failed: 3, total: 10 },
				signalAssessment: {
					classification: "trustworthy",
					reasons: [],
				},
			},
			{
				...buildItem("02", "todo-app", "blind", 900),
				automatedScore: { passed: 10, failed: 0, total: 10 },
				signalAssessment: {
					classification: "tainted",
					reasons: ["tool_permission_denied"],
				},
			},
		]);

		const comparison = compareRuns(runA, runB);

		expect(comparison.summary.scoringDelta?.passRateDelta).toBe(60);
		expect(comparison.summary.trustedScoringDelta?.passRateDelta).toBe(20);
		expect(comparison.summary.signal).toEqual({
			trustedMetricsAvailable: true,
			taintedInA: 1,
			taintedInB: 1,
		});
	});
});
