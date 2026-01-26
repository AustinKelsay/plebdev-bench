/**
 * Purpose: Test run statistics calculation and formatting.
 */

import { describe, expect, it } from "vitest";
import { calculateRunStats, formatRunStats, type RunStats } from "../src/lib/stats.js";
import type { MatrixItemResult } from "../src/schemas/index.js";

/** Helper to create a minimal result item. */
function createResult(overrides: Partial<MatrixItemResult> = {}): MatrixItemResult {
	return {
		id: "01",
		model: "llama3.2:3b",
		harness: "ollama",
		test: "smoke",
		passType: "blind",
		status: "completed",
		...overrides,
	};
}

describe("calculateRunStats", () => {
	describe("timing stats", () => {
		it("should calculate average generation time", () => {
			const results: MatrixItemResult[] = [
				createResult({ generation: { success: true, output: "code", durationMs: 1000 } }),
				createResult({ generation: { success: true, output: "code", durationMs: 3000 } }),
				createResult({ generation: { success: true, output: "code", durationMs: 2000 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.timing.avgGenerationMs).toBe(2000);
			expect(stats.timing.minGenerationMs).toBe(1000);
			expect(stats.timing.maxGenerationMs).toBe(3000);
		});

		it("should handle empty results", () => {
			const stats = calculateRunStats([]);

			expect(stats.timing.avgGenerationMs).toBe(0);
			expect(stats.timing.minGenerationMs).toBe(0);
			expect(stats.timing.maxGenerationMs).toBe(0);
		});

		it("should calculate scoring time average", () => {
			const results: MatrixItemResult[] = [
				createResult({
					generation: { success: true, output: "code", durationMs: 1000 },
					scoringMetrics: { durationMs: 100 },
				}),
				createResult({
					generation: { success: true, output: "code", durationMs: 1000 },
					scoringMetrics: { durationMs: 200 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.timing.avgScoringMs).toBe(150);
		});

		it("should calculate frontier eval time average", () => {
			const results: MatrixItemResult[] = [
				createResult({
					generation: { success: true, output: "code", durationMs: 1000 },
					frontierEval: { score: 8, reasoning: "good", model: "gpt-5.2", latencyMs: 500 },
				}),
				createResult({
					generation: { success: true, output: "code", durationMs: 1000 },
					frontierEval: { score: 7, reasoning: "ok", model: "gpt-5.2", latencyMs: 700 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.timing.avgFrontierEvalMs).toBe(600);
		});
	});

	describe("token stats", () => {
		it("should calculate token totals and averages", () => {
			const results: MatrixItemResult[] = [
				createResult({
					generation: { success: true, output: "code", durationMs: 1000, promptTokens: 100, completionTokens: 50 },
				}),
				createResult({
					generation: { success: true, output: "code", durationMs: 1000, promptTokens: 200, completionTokens: 100 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.tokens).not.toBeNull();
			expect(stats.tokens?.totalPromptTokens).toBe(300);
			expect(stats.tokens?.totalCompletionTokens).toBe(150);
			expect(stats.tokens?.avgCompletionTokens).toBe(75);
			expect(stats.tokens?.itemsWithTokens).toBe(2);
		});

		it("should return null when no token data", () => {
			const results: MatrixItemResult[] = [
				createResult({ generation: { success: true, output: "code", durationMs: 1000 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.tokens).toBeNull();
		});
	});

	describe("scoring stats", () => {
		it("should calculate pass rate and totals", () => {
			const results: MatrixItemResult[] = [
				createResult({
					test: "test-a",
					automatedScore: { passed: 5, failed: 5, total: 10 },
				}),
				createResult({
					test: "test-b",
					automatedScore: { passed: 8, failed: 2, total: 10 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.scoring).not.toBeNull();
			expect(stats.scoring?.totalPassed).toBe(13);
			expect(stats.scoring?.totalTests).toBe(20);
			expect(stats.scoring?.passRate).toBe(65);
		});

		it("should break down by test", () => {
			const results: MatrixItemResult[] = [
				createResult({ test: "calculator", automatedScore: { passed: 8, failed: 2, total: 10 } }),
				createResult({ test: "todo-app", automatedScore: { passed: 3, failed: 7, total: 10 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.scoring?.byTest).toHaveLength(2);
			// Sorted by pass rate (descending)
			expect(stats.scoring?.byTest[0].name).toBe("calculator");
			expect(stats.scoring?.byTest[0].passRate).toBe(80);
			expect(stats.scoring?.byTest[1].name).toBe("todo-app");
			expect(stats.scoring?.byTest[1].passRate).toBe(30);
		});

		it("should break down by harness", () => {
			const results: MatrixItemResult[] = [
				createResult({ harness: "ollama", automatedScore: { passed: 9, failed: 1, total: 10 } }),
				createResult({ harness: "goose", automatedScore: { passed: 5, failed: 5, total: 10 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.scoring?.byHarness).toHaveLength(2);
			expect(stats.scoring?.byHarness[0].name).toBe("ollama");
			expect(stats.scoring?.byHarness[0].passRate).toBe(90);
		});

		it("should break down by model", () => {
			const results: MatrixItemResult[] = [
				createResult({ model: "llama3.2:3b", automatedScore: { passed: 6, failed: 4, total: 10 } }),
				createResult({ model: "qwen2.5:7b", automatedScore: { passed: 7, failed: 3, total: 10 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.scoring?.byModel).toHaveLength(2);
			expect(stats.scoring?.byModel[0].name).toBe("qwen2.5:7b");
			expect(stats.scoring?.byModel[0].passRate).toBe(70);
		});

		it("should return null when no scoring data", () => {
			const results: MatrixItemResult[] = [
				createResult({ generation: { success: true, output: "code", durationMs: 1000 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.scoring).toBeNull();
		});
	});

	describe("frontier stats", () => {
		it("should calculate average score and range", () => {
			const results: MatrixItemResult[] = [
				createResult({ frontierEval: { score: 8, reasoning: "good", model: "gpt-5.2" } }),
				createResult({ frontierEval: { score: 6, reasoning: "ok", model: "gpt-5.2" } }),
				createResult({ frontierEval: { score: 10, reasoning: "excellent", model: "gpt-5.2" } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.frontier).not.toBeNull();
			expect(stats.frontier?.avgScore).toBe(8);
			expect(stats.frontier?.minScore).toBe(6);
			expect(stats.frontier?.maxScore).toBe(10);
			expect(stats.frontier?.itemCount).toBe(3);
		});

		it("should break down by harness", () => {
			const results: MatrixItemResult[] = [
				createResult({ harness: "ollama", frontierEval: { score: 9, reasoning: "x", model: "gpt-5.2" } }),
				createResult({ harness: "ollama", frontierEval: { score: 7, reasoning: "x", model: "gpt-5.2" } }),
				createResult({ harness: "goose", frontierEval: { score: 5, reasoning: "x", model: "gpt-5.2" } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.frontier?.byHarness).toHaveLength(2);
			expect(stats.frontier?.byHarness[0].name).toBe("ollama");
			expect(stats.frontier?.byHarness[0].avgScore).toBe(8);
			expect(stats.frontier?.byHarness[0].count).toBe(2);
		});

		it("should break down by model", () => {
			const results: MatrixItemResult[] = [
				createResult({ model: "llama3.2:3b", frontierEval: { score: 6, reasoning: "x", model: "gpt-5.2" } }),
				createResult({ model: "qwen2.5:7b", frontierEval: { score: 8, reasoning: "x", model: "gpt-5.2" } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.frontier?.byModel).toHaveLength(2);
			expect(stats.frontier?.byModel[0].name).toBe("qwen2.5:7b");
			expect(stats.frontier?.byModel[0].avgScore).toBe(8);
		});

		it("should return null when no frontier data", () => {
			const results: MatrixItemResult[] = [
				createResult({ generation: { success: true, output: "code", durationMs: 1000 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.frontier).toBeNull();
		});
	});

	describe("generation failure stats", () => {
		it("should calculate failure breakdown by type", () => {
			const results: MatrixItemResult[] = [
				createResult({
					status: "failed",
					generation: { success: false, error: "timed out", failureType: "timeout", durationMs: 0 },
				}),
				createResult({
					status: "failed",
					generation: { success: false, error: "timed out", failureType: "timeout", durationMs: 0 },
				}),
				createResult({
					status: "failed",
					generation: { success: false, error: "empty output", failureType: "harness_error", durationMs: 0 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.generationFailures).not.toBeNull();
			expect(stats.generationFailures?.total).toBe(3);
			expect(stats.generationFailures?.byType).toContainEqual({ type: "timeout", count: 2 });
			expect(stats.generationFailures?.byType).toContainEqual({ type: "harness_error", count: 1 });
		});

		it("should return null when no failures", () => {
			const results: MatrixItemResult[] = [
				createResult({ generation: { success: true, output: "code", durationMs: 1000 } }),
			];

			const stats = calculateRunStats(results);

			expect(stats.generationFailures).toBeNull();
		});

		it("should default to unknown for missing failureType", () => {
			const results: MatrixItemResult[] = [
				createResult({
					status: "failed",
					generation: { success: false, error: "some error", durationMs: 0 },
				}),
			];

			const stats = calculateRunStats(results);

			expect(stats.generationFailures).not.toBeNull();
			expect(stats.generationFailures?.byType).toContainEqual({ type: "unknown", count: 1 });
		});
	});
});

describe("formatRunStats", () => {
	it("should format basic timing stats", () => {
		const stats: RunStats = {
			timing: {
				avgGenerationMs: 5000,
				avgScoringMs: null,
				avgFrontierEvalMs: null,
				minGenerationMs: 2000,
				maxGenerationMs: 8000,
			},
			tokens: null,
			scoring: null,
			frontier: null,
			generationFailures: null,
		};

		const output = formatRunStats(stats, "test-run", 10, 2, 12, 60000, "results");

		expect(output).toContain("Run complete: test-run");
		expect(output).toContain("Completed: 10/12");
		expect(output).toContain("Failed: 2");
		expect(output).toContain("Duration: 1m 0s");
		expect(output).toContain("Avg generation:");
		expect(output).toContain("5.0s");
		expect(output).toContain("Generation range:");
	});

	it("should include token stats when available", () => {
		const stats: RunStats = {
			timing: {
				avgGenerationMs: 1000,
				avgScoringMs: null,
				avgFrontierEvalMs: null,
				minGenerationMs: 1000,
				maxGenerationMs: 1000,
			},
			tokens: {
				totalPromptTokens: 1000,
				totalCompletionTokens: 500,
				avgCompletionTokens: 250,
				itemsWithTokens: 2,
			},
			scoring: null,
			frontier: null,
			generationFailures: null,
		};

		const output = formatRunStats(stats, "test-run", 2, 0, 2, 10000, "results");

		expect(output).toContain("Tokens");
		expect(output).toContain("Total prompt:");
		expect(output).toContain("1,000");
		expect(output).toContain("Total completion:");
		expect(output).toContain("500");
		expect(output).toContain("Avg completion:");
		expect(output).toContain("250/item");
	});

		it("should include scoring stats when available", () => {
			const stats: RunStats = {
				timing: {
					avgGenerationMs: 1000,
					avgScoringMs: 100,
					avgFrontierEvalMs: null,
					minGenerationMs: 1000,
					maxGenerationMs: 1000,
				},
				tokens: null,
				scoring: {
					passRate: 75,
					totalPassed: 15,
					totalTests: 20,
					byTest: [{ name: "test-a", passed: 15, total: 20, passRate: 75 }],
					byHarness: [{ name: "ollama", passed: 15, total: 20, passRate: 75 }],
					byModel: [{ name: "llama3.2:3b", passed: 15, total: 20, passRate: 75 }],
				},
				frontier: null,
				generationFailures: null,
			};

		const output = formatRunStats(stats, "test-run", 2, 0, 2, 10000, "results");

		expect(output).toContain("Scoring");
		expect(output).toContain("Pass rate: 75.0%");
		expect(output).toContain("15/20 tests");
		expect(output).toContain("Avg scoring:");
	});

		it("should include frontier stats when available", () => {
			const stats: RunStats = {
				timing: {
					avgGenerationMs: 1000,
					avgScoringMs: null,
					avgFrontierEvalMs: 2000,
					minGenerationMs: 1000,
					maxGenerationMs: 1000,
				},
				tokens: null,
				scoring: null,
				frontier: {
					avgScore: 7.5,
					itemCount: 4,
					minScore: 5,
					maxScore: 10,
					byHarness: [{ name: "ollama", avgScore: 7.5, count: 4 }],
					byModel: [{ name: "llama3.2:3b", avgScore: 7.5, count: 4 }],
				},
				generationFailures: null,
			};

		const output = formatRunStats(stats, "test-run", 4, 0, 4, 10000, "results");

		expect(output).toContain("Frontier Eval");
		expect(output).toContain("Avg score: 7.5/10");
		expect(output).toContain("4 items");
		expect(output).toContain("Range: 5/10 - 10/10");
		expect(output).toContain("Avg frontier eval:");
	});

		it("should show breakdowns when multiple dimensions", () => {
			const stats: RunStats = {
				timing: {
					avgGenerationMs: 1000,
					avgScoringMs: null,
					avgFrontierEvalMs: null,
					minGenerationMs: 1000,
					maxGenerationMs: 1000,
				},
				tokens: null,
				scoring: {
					passRate: 50,
					totalPassed: 10,
					totalTests: 20,
					byTest: [
						{ name: "test-a", passed: 8, total: 10, passRate: 80 },
						{ name: "test-b", passed: 2, total: 10, passRate: 20 },
					],
					byHarness: [
						{ name: "ollama", passed: 6, total: 10, passRate: 60 },
						{ name: "goose", passed: 4, total: 10, passRate: 40 },
					],
					byModel: [
						{ name: "llama3.2:3b", passed: 5, total: 10, passRate: 50 },
						{ name: "qwen2.5:7b", passed: 5, total: 10, passRate: 50 },
					],
				},
				frontier: null,
				generationFailures: null,
			};

		const output = formatRunStats(stats, "test-run", 4, 0, 4, 10000, "results");

		expect(output).toContain("By test:");
		expect(output).toContain("test-a");
		expect(output).toContain("80.0%");
		expect(output).toContain("By harness:");
		expect(output).toContain("ollama");
		expect(output).toContain("By model:");
	});

		it("should include results path", () => {
			const stats: RunStats = {
				timing: {
					avgGenerationMs: 1000,
					avgScoringMs: null,
					avgFrontierEvalMs: null,
					minGenerationMs: 1000,
					maxGenerationMs: 1000,
				},
				tokens: null,
				scoring: null,
				frontier: null,
				generationFailures: null,
			};

		const output = formatRunStats(stats, "my-run-id", 1, 0, 1, 1000, "output/dir");

		expect(output).toContain("Results: output/dir/my-run-id/");
	});
});
