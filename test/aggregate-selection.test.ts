/**
 * Purpose: Validate Best Observed Item selection policy.
 * Exports: none
 *
 * Invariants:
 * - Optional Frontier Eval does not influence canonical aggregate row selection.
 * - Generation duration remains timing analysis, not aggregate selection input.
 */

import { describe, expect, it } from "vitest";
import { compareAggregateCandidates } from "../src/results/aggregate-selection.js";
import type { AggregatedMatrixItem } from "../src/results/aggregate.js";

/**
 * Creates an aggregated item candidate with stable local benchmark outcomes.
 *
 * @param overrides - Candidate fields to override
 * @returns Aggregated matrix item for selection tests
 */
function createAggregatedItem(
	overrides: Partial<AggregatedMatrixItem> = {},
): AggregatedMatrixItem {
	return {
		id: "01",
		runtime: "ollama",
		model: "llama3.2:3b",
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		generation: {
			success: true,
			output: "code",
			durationMs: 1000,
		},
		automatedScore: {
			passed: 6,
			failed: 0,
			total: 6,
		},
		machineProfileKey: "mac-mini-m4",
		verificationStatus: "self_reported",
		modelProfileResolutionSource: "runtime_name",
		sourceRunId: "run-a",
		sourceCompletedAt: "2026-03-04T12:00:00.000Z",
		...overrides,
	};
}

describe("compareAggregateCandidates", () => {
	it("does not use optional Frontier Eval as a Best Observed Item tie-breaker", () => {
		const incumbent = {
			timestamp: 100,
			aggregated: createAggregatedItem({
				frontierEval: {
					score: 10,
					reasoning: "higher optional eval",
					model: "grader",
				},
			}),
		};
		const candidate = {
			timestamp: 200,
			aggregated: createAggregatedItem({
				frontierEval: {
					score: 1,
					reasoning: "lower optional eval",
					model: "grader",
				},
				sourceRunId: "run-b",
				sourceCompletedAt: "2026-03-04T12:10:00.000Z",
			}),
		};

		expect(compareAggregateCandidates(candidate, incumbent)).toBeGreaterThan(0);
	});

	it("does not use generation duration as a Best Observed Item tie-breaker", () => {
		const incumbent = {
			timestamp: 100,
			aggregated: createAggregatedItem({
				generation: {
					success: true,
					output: "code",
					durationMs: 100,
				},
			}),
		};
		const candidate = {
			timestamp: 200,
			aggregated: createAggregatedItem({
				generation: {
					success: true,
					output: "code",
					durationMs: 1000,
				},
				sourceRunId: "run-b",
				sourceCompletedAt: "2026-03-04T12:10:00.000Z",
			}),
		};

		expect(compareAggregateCandidates(candidate, incumbent)).toBeGreaterThan(0);
	});

	it("fails fast for unknown item statuses", () => {
		const candidate = {
			timestamp: 200,
			aggregated: createAggregatedItem({
				status: "cancelled" as AggregatedMatrixItem["status"],
			}),
		};
		const incumbent = {
			timestamp: 100,
			aggregated: createAggregatedItem(),
		};

		expect(() => compareAggregateCandidates(candidate, incumbent)).toThrow(
			"Unhandled status: cancelled",
		);
	});
});
