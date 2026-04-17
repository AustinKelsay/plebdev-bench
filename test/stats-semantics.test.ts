/**
 * Purpose: Verify stats distinguish semantic scored-check rate from item success.
 */

import { describe, expect, it } from "vitest";
import { calculateRunStats, formatRunStats } from "../src/lib/stats.js";
import type { MatrixItemResult } from "../src/schemas/index.js";

function createResult(
	overrides: Partial<MatrixItemResult> = {},
): MatrixItemResult {
	return {
		id: "01",
		runtime: "ollama",
		model: "qwen3.5:4b",
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		...overrides,
	};
}

describe("stats semantics", () => {
	it("tracks scored-row coverage and item success separately", () => {
		const stats = calculateRunStats([
			createResult({
				status: "completed",
				automatedScore: { passed: 6, failed: 0, total: 6 },
				generation: { success: true, output: "ok", durationMs: 1000 },
			}),
			createResult({
				id: "02",
				status: "failed",
				automatedScore: { passed: 3, failed: 3, total: 6 },
				generation: { success: true, output: "partial", durationMs: 1000 },
				scoringFailure: {
					type: "test_execution",
					message: "failed assertions",
				},
			}),
			createResult({
				id: "03",
				status: "failed",
				generation: {
					success: false,
					error: "timed out",
					failureType: "timeout",
					durationMs: 0,
				},
				generationFailure: { type: "timeout", message: "timed out" },
			}),
		]);

		expect(stats.scoring?.passRate).toBe(75);
		expect(stats.scoring?.itemSuccessRate).toBeCloseTo(33.3333, 3);
		expect(stats.scoring?.scoredItemRate).toBeCloseTo(66.6666, 3);

		const output = formatRunStats(stats, "run-1", 1, 2, 3, 10_000, "results");
		expect(output).toContain("Semantic pass rate:");
		expect(output).toContain("Item success rate:");
		expect(output).toContain("Scored rows:");
	});
});
