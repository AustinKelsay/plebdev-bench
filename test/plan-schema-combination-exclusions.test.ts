/**
 * Purpose: Validate RunPlan schema support for Combination Exclusions.
 * Exports: none
 *
 * Invariants:
 * - Combination Exclusions are planning evidence outside the Matrix.
 */

import { describe, expect, it } from "vitest";
import { RunPlanSchema } from "../src/schemas/index.js";

describe("RunPlanSchema Combination Exclusions", () => {
	it("validates Combination Exclusions as planning evidence", () => {
		const plan = RunPlanSchema.parse({
			runId: "20260114-143052-abc123",
			createdAt: "2026-01-14T14:30:52.000Z",
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				passTypes: ["blind"],
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
				},
			],
			combinationExclusions: [
				{
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "workspace-smoke",
					reason: "missing_tool_harness",
					requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
				},
			],
			summary: {
				totalItems: 1,
				runtimes: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
			},
		});

		expect(plan.combinationExclusions?.[0]).toMatchObject({
			test: "workspace-smoke",
			reason: "missing_tool_harness",
		});
	});
});
