/**
 * Purpose: Deterministic regression tests for compare-command terminal formatters.
 * Exports: none
 *
 * Invariants:
 * - Formatter output is stable for fixed comparison fixtures.
 * - Tests capture stdout without touching filesystem, network, or clocks.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	printExclusiveItems,
	printHeader,
	printScoringDeltas,
	printSummary,
} from "../src/cli/compare-formatters.js";
import type { CompareResult } from "../src/results/compare.js";
import type { MatrixItemResult } from "../src/schemas/index.js";

function createMatrixItemResult(
	overrides: Partial<MatrixItemResult> = {},
): MatrixItemResult {
	return {
		id: overrides.id ?? "row-1",
		runtime: overrides.runtime ?? "ollama",
		model: overrides.model ?? "base-model",
		harness: overrides.harness ?? "direct",
		test: overrides.test ?? "smoke",
		passType: overrides.passType ?? "blind",
		status: overrides.status ?? "completed",
		signalAssessment: overrides.signalAssessment ?? {
			classification: "trustworthy",
			reasons: [],
		},
		...overrides,
	};
}

function buildCompareFixture(): CompareResult {
	const scoringDownA = createMatrixItemResult({
		id: "matched-a-1",
		model: "regressor-model",
		test: "status-regression",
		automatedScore: { passed: 4, failed: 1, total: 5 },
	});
	const scoringDownB = createMatrixItemResult({
		id: "matched-b-1",
		model: "regressor-model",
		test: "status-regression",
		status: "failed",
		automatedScore: { passed: 3, failed: 2, total: 5 },
	});
	const scoringUpA = createMatrixItemResult({
		id: "matched-a-2",
		model: "improver-model",
		test: "status-improvement",
		status: "failed",
		automatedScore: { passed: 1, failed: 4, total: 5 },
	});
	const scoringUpB = createMatrixItemResult({
		id: "matched-b-2",
		model: "improver-model",
		test: "status-improvement",
		automatedScore: { passed: 3, failed: 2, total: 5 },
	});
	const neutralA = createMatrixItemResult({
		id: "matched-a-3",
		model: "neutral-model",
		test: "frontier-delta",
	});
	const neutralB = createMatrixItemResult({
		id: "matched-b-3",
		model: "neutral-model",
		test: "frontier-delta",
	});

	return {
		runA: {
			runId: "run-a",
			timestamp: "2026-01-02T03:04:05.000Z",
		},
		runB: {
			runId: "run-b",
			timestamp: "2026-01-03T04:05:06.000Z",
		},
		summary: {
			totalMatched: 3,
			totalOnlyInA: 11,
			totalOnlyInB: 1,
			statusChanges: {
				improved: 1,
				regressed: 1,
			},
			scoringDelta: {
				passRateDelta: 5,
				totalTestsDelta: 0,
			},
			trustedScoringDelta: {
				passRateDelta: 2,
				totalTestsDelta: 0,
			},
			frontierEvalDelta: {
				avgScoreDelta: 1.5,
			},
			trustedFrontierEvalDelta: {
				avgScoreDelta: 1,
			},
			metricAvailability: {
				scoring: {
					matchedRows: 3,
					comparedRows: 2,
					trustedComparedRows: 1,
				},
				frontierEval: {
					matchedRows: 3,
					comparedRows: 2,
					trustedComparedRows: 1,
				},
			},
			signal: {
				trustedMetricsAvailable: true,
				taintedInA: 1,
				taintedInB: 0,
			},
		},
		matched: [
			{
				key: "regressor",
				model: "regressor-model",
				harness: "direct",
				test: "status-regression",
				passType: "blind",
				itemA: scoringDownA,
				itemB: scoringDownB,
				deltas: {
					status: { a: "completed", b: "failed" },
					automatedScore: {
						passedDelta: -1,
						failedDelta: 1,
						totalDelta: 0,
						passRateDelta: -20,
					},
					frontierEval: null,
					durationMs: 10,
				},
			},
			{
				key: "improver",
				model: "improver-model",
				harness: "direct",
				test: "status-improvement",
				passType: "blind",
				itemA: scoringUpA,
				itemB: scoringUpB,
				deltas: {
					status: { a: "failed", b: "completed" },
					automatedScore: {
						passedDelta: 2,
						failedDelta: -2,
						totalDelta: 0,
						passRateDelta: 40,
					},
					frontierEval: null,
					durationMs: -5,
				},
			},
			{
				key: "neutral",
				model: "neutral-model",
				harness: "goose",
				test: "frontier-delta",
				passType: "informed",
				itemA: neutralA,
				itemB: neutralB,
				deltas: {
					status: null,
					automatedScore: null,
					frontierEval: { scoreDelta: 1.5 },
					durationMs: 0,
				},
			},
		],
		onlyInA: Array.from({ length: 11 }, (_, index) =>
			createMatrixItemResult({
				id: `only-a-${index + 1}`,
				model: `model-name-that-is-very-long-${index + 1}`,
				harness: `workspace-harness-${index + 1}`,
				test: `test-name-that-is-also-very-long-${index + 1}`,
				passType: index % 2 === 0 ? "blind" : "informed",
			}),
		),
		onlyInB: [
			createMatrixItemResult({
				id: "only-b-1",
				model: "other-model-name-that-is-very-long",
				harness: "direct",
				test: "other-test-name-that-is-very-long",
				passType: "blind",
			}),
		],
	};
}

function readLoggedOutput(logSpy: ReturnType<typeof vi.spyOn>): string {
	return logSpy.mock.calls
		.map((args) => args.map((value) => String(value)).join(" "))
		.join("\n");
}

describe("compare formatters", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prints deterministic UTC header timestamps", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		printHeader(buildCompareFixture());

		const output = readLoggedOutput(logSpy);
		expect(output).toContain("Run A: run-a (Jan 02, 03:04)");
		expect(output).toContain("Run B: run-b (Jan 03, 04:05)");
	});

	it("prints summary metrics and trusted branches", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		printSummary(buildCompareFixture());

		const output = readLoggedOutput(logSpy);
		expect(output).toContain("Matched items:  3");
		expect(output).toContain("Raw pass rate:      Δ +5.0%");
		expect(output).toContain("Trusted pass rate:  Δ +2.0%");
		expect(output).toContain("Raw avg score:      Δ +1.5/10");
		expect(output).toContain("Trusted avg score:  Δ +1.0/10");
		expect(output).toContain("Tainted in A:  1");
	});

	it("prints scoring deltas in sorted order with bounded columns", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		printScoringDeltas(buildCompareFixture());

		const output = readLoggedOutput(logSpy);
		expect(output).toContain("Δ RATE");
		expect(output.indexOf("regressor-model")).toBeLessThan(
			output.indexOf("improver-model"),
		);
		expect(output).toContain("Δ -20.0%");
		expect(output).toContain("Δ +40.0%");
	});

	it("prints exclusive items with truncation and overflow counts", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		printExclusiveItems(buildCompareFixture());

		const output = readLoggedOutput(logSpy);
		expect(output).toContain("Items only in Run A (11)");
		expect(output).toContain("Items only in Run B (1)");
		expect(output).toContain("MODEL");
		expect(output).toContain("…");
		expect(output).toContain("... and 1 more");
		expect(output).not.toContain("model-name-that-is-very-long-11");
	});
});
