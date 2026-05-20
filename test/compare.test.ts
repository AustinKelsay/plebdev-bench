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
			"llama3.2:3b|ollama|llama3.2:3b|direct|smoke|blind",
			"llama3.2:3b|ollama|llama3.2:3b|direct|smoke|informed",
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

	it("reports full-vs-partial Run Config differences as coverage gaps", () => {
		const smokeBlind = buildItem("01", "smoke", "blind", 1000);
		const smokeInformed = buildItem("02", "smoke", "informed", 1200);
		const todoBlind = buildItem("03", "todo-app", "blind", 1500);

		const comparison = compareRuns(
			buildRun("full-run", [smokeBlind, smokeInformed, todoBlind]),
			buildRun("partial-run", [smokeBlind]),
		);

		expect(comparison.matched).toHaveLength(1);
		expect(comparison.onlyInA).toHaveLength(2);
		expect(comparison.onlyInB).toHaveLength(0);
		expect(comparison.summary.coverage).toEqual({
			comparisonSpaceItems: 3,
			matchedItems: 1,
			unmatchedItems: 2,
			matchedCoverageRate: 1 / 3,
		});
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

	it("does not match different runtimes when canonical model profiles align", () => {
		const runA = buildRun("run-a", [
			{
				...buildItem("01", "smoke", "blind", 1000),
				model: "qwen3:27b",
				modelAlias: "qwen3-27b-instruct",
				modelProfile: {
					canonical: {
						profileKey: "qwen3-27b-instruct",
						profileLabel: "Qwen 3 27B Instruct",
						family: "qwen3",
						parametersBillions: 27,
						parameterScaleLabel: "27B",
						tuning: "instruct",
					},
					variant: {
						variantKey: "ollama-qwen3-27b",
						variantLabel: "qwen3:27b",
						runtime: "ollama",
						runtimeModelName: "qwen3:27b",
					},
					resolutionSource: "configured_profile",
				},
			},
		]);
		const runB = buildRun("run-b", [
			{
				...buildItem("01", "smoke", "blind", 900),
				runtime: "vllm",
				model: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
				modelAlias: "qwen3-27b-instruct",
				modelProfile: {
					canonical: {
						profileKey: "qwen3-27b-instruct",
						profileLabel: "Qwen 3 27B Instruct",
						family: "qwen3",
						parametersBillions: 27,
						parameterScaleLabel: "27B",
						tuning: "instruct",
					},
					variant: {
						variantKey: "vllm-qwen3-27b-instruct-mlx-4bit",
						variantLabel: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
						runtime: "vllm",
						runtimeModelName: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
						format: "MLX",
						quantization: "4-bit",
					},
					resolutionSource: "configured_profile",
				},
			},
		]);

		const comparison = compareRuns(runA, runB);

		expect(comparison.matched).toHaveLength(0);
		expect(comparison.onlyInA).toHaveLength(1);
		expect(comparison.onlyInB).toHaveLength(1);
	});

	it("does not match different runtime variants within the same runtime", () => {
		const runA = buildRun("run-a", [
			{
				...buildItem("01", "smoke", "blind", 1000),
				model: "qwen3:27b-q4",
				modelAlias: "qwen3-27b-instruct",
				modelProfile: {
					canonical: {
						profileKey: "qwen3-27b-instruct",
						profileLabel: "Qwen 3 27B Instruct",
						family: "qwen3",
						parametersBillions: 27,
						parameterScaleLabel: "27B",
						tuning: "instruct",
					},
					variant: {
						variantKey: "ollama-qwen3-27b-q4",
						variantLabel: "qwen3:27b-q4",
						runtime: "ollama",
						runtimeModelName: "qwen3:27b-q4",
						quantization: "Q4",
					},
					resolutionSource: "configured_profile",
				},
			},
		]);
		const runB = buildRun("run-b", [
			{
				...buildItem("01", "smoke", "blind", 900),
				model: "qwen3:27b-q6",
				modelAlias: "qwen3-27b-instruct",
				modelProfile: {
					canonical: {
						profileKey: "qwen3-27b-instruct",
						profileLabel: "Qwen 3 27B Instruct",
						family: "qwen3",
						parametersBillions: 27,
						parameterScaleLabel: "27B",
						tuning: "instruct",
					},
					variant: {
						variantKey: "ollama-qwen3-27b-q6",
						variantLabel: "qwen3:27b-q6",
						runtime: "ollama",
						runtimeModelName: "qwen3:27b-q6",
						quantization: "Q6",
					},
					resolutionSource: "configured_profile",
				},
			},
		]);

		const comparison = compareRuns(runA, runB);

		expect(comparison.matched).toHaveLength(0);
		expect(comparison.onlyInA).toHaveLength(1);
		expect(comparison.onlyInB).toHaveLength(1);
	});

	it("keeps trusted deltas for matched rows even when unmatched rows lack signal assessments", () => {
		const trustedA = {
			...buildItem("01", "smoke", "blind", 1000),
			automatedScore: { passed: 4, failed: 6, total: 10 },
			signalAssessment: {
				classification: "trustworthy" as const,
				reasons: [],
			},
		};
		const trustedB = {
			...buildItem("01", "smoke", "blind", 900),
			automatedScore: { passed: 8, failed: 2, total: 10 },
			signalAssessment: {
				classification: "trustworthy" as const,
				reasons: [],
			},
		};
		const unmatchedWithoutSignal = {
			...buildItem("02", "todo-app", "blind", 1100),
			automatedScore: { passed: 1, failed: 9, total: 10 },
		};

		const comparison = compareRuns(
			buildRun("run-a", [trustedA, unmatchedWithoutSignal]),
			buildRun("run-b", [trustedB]),
		);

		expect(comparison.summary.trustedScoringDelta?.passRateDelta).toBe(40);
		expect(comparison.summary.signal.trustedMetricsAvailable).toBe(true);
		expect(comparison.summary.signal.taintedInA).toBeNull();
		expect(comparison.summary.signal.taintedInB).toBeNull();
	});

	it("computes metric deltas only across matched rows where both sides have the metric", () => {
		const comparison = compareRuns(
			buildRun("run-a", [
				{
					...buildItem("01", "smoke", "blind", 1000),
					automatedScore: { passed: 5, failed: 5, total: 10 },
					frontierEval: { score: 6, reasoning: "ok", model: "grader" },
					signalAssessment: {
						classification: "trustworthy",
						reasons: [],
					},
				},
				{
					...buildItem("02", "todo-app", "blind", 1100),
					automatedScore: { passed: 10, failed: 0, total: 10 },
					frontierEval: { score: 9, reasoning: "great", model: "grader" },
					signalAssessment: {
						classification: "trustworthy",
						reasons: [],
					},
				},
			]),
			buildRun("run-b", [
				{
					...buildItem("01", "smoke", "blind", 900),
					automatedScore: { passed: 7, failed: 3, total: 10 },
					frontierEval: { score: 8, reasoning: "better", model: "grader" },
					signalAssessment: {
						classification: "trustworthy",
						reasons: [],
					},
				},
				{
					...buildItem("02", "todo-app", "blind", 1000),
					signalAssessment: {
						classification: "trustworthy",
						reasons: [],
					},
				},
			]),
		);

		expect(comparison.summary.scoringDelta?.passRateDelta).toBe(20);
		expect(comparison.summary.frontierEvalDelta?.avgScoreDelta).toBe(2);
		expect(comparison.summary.metricAvailability.scoring).toEqual({
			matchedRows: 2,
			comparedRows: 1,
			trustedComparedRows: 1,
		});
		expect(comparison.summary.metricAvailability.frontierEval).toEqual({
			matchedRows: 2,
			comparedRows: 1,
			trustedComparedRows: 1,
		});
		expect(comparison.matched[1]?.deltas.automatedScore).toBeNull();
		expect(comparison.matched[1]?.deltas.frontierEval).toBeNull();
	});
});
