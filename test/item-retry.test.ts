/**
 * Purpose: Unit tests for compile-feedback retry flow.
 * Exports: none
 *
 * Invariants:
 * - Direct harness rows are eligible for compile-feedback retry
 * - Retry generation duration is recorded when retry generation runs
 * - Improved retry scores replace the original failed attempt
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Harness } from "../src/harnesses/index.js";
import type { Runtime } from "../src/runtimes/index.js";
import type { MatrixItem } from "../src/schemas/index.js";

const scoreGenerationMock = vi.fn();
let generateMock: ReturnType<typeof vi.fn>;

vi.mock("../src/lib/scorer.js", () => ({
	scoreGeneration: scoreGenerationMock,
}));

function createMatrixItem(test: string): MatrixItem {
	return {
		id: "01",
		runtime: "ollama",
		model: "qwen3.5:4b",
		harness: "direct",
		test,
		category: "coding",
		scoringMode: "code-module",
		requiresTools: false,
		requiredHarnessCapabilities: [],
		tags: [],
		timeoutMultiplier: 1,
		passType: "blind",
	};
}

function createRuntime(): Runtime {
	return {
		name: "ollama",
		baseUrl: "http://localhost:11434",
		apiFormat: "ollama",
		ping: async () => true,
		listModels: async () => ["qwen3.5:4b"],
		getModelInfo: async () => ({
			name: "qwen3.5:4b",
			sizeBytes: 0,
			parametersBillions: 4,
		}),
	};
}

function createHarness(generateMock: ReturnType<typeof vi.fn>): Harness {
	return {
		name: "direct",
		ping: async () => true,
		generate: generateMock,
	};
}

describe("runScoringWithCompileRetry", () => {
	beforeEach(() => {
		scoreGenerationMock.mockReset();
		generateMock = vi.fn();
	});

	it("retries direct-harness import failures and promotes the better retry result", async () => {
		const { runScoringWithCompileRetry } = await import(
			"../src/runner/item-retry.js"
		);
		generateMock.mockResolvedValue({
			output: "export function createValue(): number { return 42; }",
			durationMs: 1200,
		});

		scoreGenerationMock
			.mockResolvedValueOnce({
				passed: 0,
				failed: 5,
				total: 5,
				failureType: "import",
				error: "Import failed: unexpected token",
			})
			.mockResolvedValueOnce({
				passed: 5,
				failed: 0,
				total: 5,
			});

		const outcome = await runScoringWithCompileRetry({
			item: createMatrixItem("smoke"),
			generation: {
				success: true,
				output: "export const broken = ;",
				durationMs: 400,
			},
			harnessForRetry: createHarness(generateMock),
			runtimeForRetry: createRuntime(),
			promptForRetry: "Implement createValue().",
			timeoutMs: 5_000,
			unloadAfter: true,
			log: {
				info: vi.fn(),
				warn: vi.fn(),
			},
			supportsCompileRetry: true,
		});

		expect(generateMock).toHaveBeenCalledTimes(1);
		expect(generateMock.mock.calls[0]?.[0]).toMatchObject({
			model: "qwen3.5:4b",
			timeoutMs: 4600,
		});
		expect(generateMock.mock.calls[0]?.[0]?.prompt).toContain(
			"Compiler/build error: Import failed: unexpected token",
		);
		expect(outcome.compileRetryUsed).toBe(true);
		expect(outcome.retryGenerationDurationMs).toBe(1200);
		expect(outcome.scoringResult).toMatchObject({
			passed: 5,
			failed: 0,
			total: 5,
		});
		expect(outcome.generation.output).toBe(
			"export function createValue(): number { return 42; }",
		);
	});

	it("retries direct-harness missing-export failures and records retry duration", async () => {
		const { runScoringWithCompileRetry } = await import(
			"../src/runner/item-retry.js"
		);
		generateMock.mockResolvedValue({
			output:
				"export function createTodoApp(): { ok: boolean } { return { ok: true }; }",
			durationMs: 900,
		});

		scoreGenerationMock
			.mockResolvedValueOnce({
				passed: 2,
				failed: 3,
				total: 5,
				failureType: "missing_export",
				error: "Missing export: createTodoApp",
			})
			.mockResolvedValueOnce({
				passed: 5,
				failed: 0,
				total: 5,
			});

		const outcome = await runScoringWithCompileRetry({
			item: createMatrixItem("todo-app"),
			generation: {
				success: true,
				output: "export const notTheRightThing = true;",
				durationMs: 300,
			},
			harnessForRetry: createHarness(generateMock),
			runtimeForRetry: createRuntime(),
			promptForRetry: "Implement createTodoApp().",
			timeoutMs: 5_000,
			unloadAfter: true,
			log: {
				info: vi.fn(),
				warn: vi.fn(),
			},
			supportsCompileRetry: true,
		});

		expect(generateMock).toHaveBeenCalledTimes(1);
		expect(generateMock.mock.calls[0]?.[0]?.prompt).toContain(
			"Compiler/build error: Missing export: createTodoApp",
		);
		expect(outcome.compileRetryUsed).toBe(true);
		expect(outcome.retryGenerationDurationMs).toBe(900);
		expect(outcome.scoringResult).toMatchObject({
			passed: 5,
			failed: 0,
			total: 5,
		});
		expect(outcome.generation.output).toContain("createTodoApp");
	});
});
