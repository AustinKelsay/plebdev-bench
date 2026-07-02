/**
 * Purpose: Verify runner-level Ollama residency guard orchestration.
 * Exports: none
 *
 * Invariants:
 * - Runner dependencies are mocked to keep tests deterministic.
 * - The guard runs before item execution and after the final row for a model.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	BenchConfig,
	MatrixItem,
	MatrixItemResult,
	RunPlan,
} from "../src/schemas/index.js";

interface TestMocks {
	buildRunPlan: ReturnType<typeof vi.fn>;
	executeItem: ReturnType<typeof vi.fn>;
	ensureOnlyOllamaModelLoaded: ReturnType<typeof vi.fn>;
	createRuntime: ReturnType<typeof vi.fn>;
	writePlan: ReturnType<typeof vi.fn>;
	writePartialResult: ReturnType<typeof vi.fn>;
	writeResult: ReturnType<typeof vi.fn>;
	deletePartialResult: ReturnType<typeof vi.fn>;
	hasOpenRouterKey: ReturnType<typeof vi.fn>;
	loggerChild: {
		debug: ReturnType<typeof vi.fn>;
		info: ReturnType<typeof vi.fn>;
		warn: ReturnType<typeof vi.fn>;
	};
	loggerRoot: {
		debug: ReturnType<typeof vi.fn>;
		error: ReturnType<typeof vi.fn>;
		info: ReturnType<typeof vi.fn>;
		warn: ReturnType<typeof vi.fn>;
	};
	loggerFactory: ReturnType<typeof vi.fn>;
}

let mocks: TestMocks;

vi.mock("../src/runner/plan-builder.js", () => ({
	buildRunPlan: (...args: unknown[]) => mocks.buildRunPlan(...args),
}));

vi.mock("../src/runner/item-executor.js", () => ({
	executeItem: (...args: unknown[]) => mocks.executeItem(...args),
}));

vi.mock("../src/runtimes/ollama-residency.js", () => ({
	ensureOnlyOllamaModelLoaded: (...args: unknown[]) =>
		mocks.ensureOnlyOllamaModelLoaded(...args),
}));

vi.mock("../src/runtimes/index.js", () => ({
	createRuntime: (...args: unknown[]) => mocks.createRuntime(...args),
}));

vi.mock("../src/results/writer.js", () => ({
	writePlan: (...args: unknown[]) => mocks.writePlan(...args),
	writePartialResult: (...args: unknown[]) => mocks.writePartialResult(...args),
	writeResult: (...args: unknown[]) => mocks.writeResult(...args),
	deletePartialResult: (...args: unknown[]) =>
		mocks.deletePartialResult(...args),
}));

vi.mock("../src/lib/openrouter-client.js", () => ({
	hasOpenRouterKey: (...args: unknown[]) => mocks.hasOpenRouterKey(...args),
}));

vi.mock("../src/lib/logger.js", () => ({
	logger: {
		child: (...args: unknown[]) => mocks.loggerFactory(...args),
		debug: (...args: unknown[]) => mocks.loggerRoot.debug(...args),
		error: (...args: unknown[]) => mocks.loggerRoot.error(...args),
		info: (...args: unknown[]) => mocks.loggerRoot.info(...args),
		warn: (...args: unknown[]) => mocks.loggerRoot.warn(...args),
	},
}));

function createMocks(): TestMocks {
	return {
		buildRunPlan: vi.fn(),
		executeItem: vi.fn(),
		ensureOnlyOllamaModelLoaded: vi.fn(),
		createRuntime: vi.fn(),
		writePlan: vi.fn(),
		writePartialResult: vi.fn(),
		writeResult: vi.fn(),
		deletePartialResult: vi.fn(),
		hasOpenRouterKey: vi.fn(),
		loggerChild: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
		},
		loggerRoot: {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
		},
		loggerFactory: vi.fn(),
	};
}

const CONFIG = {
	schemaVersion: "1",
	runtimes: ["ollama"],
	models: [],
	harnesses: [],
	tests: [],
	categories: [],
	passTypes: ["blind"],
	ollamaBaseUrl: "http://localhost:11434",
	generateTimeoutMs: 300_000,
	gooseMaxTurns: 1,
	gooseRetryMaxTurns: 3,
	gooseWorkspaceMaxTurns: 8,
	gooseWorkspaceRetryMaxTurns: 12,
	hermesMaxTurns: 1,
	hermesRetryMaxTurns: 3,
	hermesWorkspaceMaxTurns: 8,
	hermesWorkspaceRetryMaxTurns: 12,
	outputDir: "results",
	minFreeDiskBytes: 0,
	modelProfiles: {},
} satisfies BenchConfig;

function createItem(id: string, model: string): MatrixItem {
	return {
		id,
		runtime: "ollama",
		model,
		harness: "direct",
		test: `smoke-${id}`,
		category: "coding",
		scoringMode: "code-module",
		requiresTools: false,
		requiredHarnessCapabilities: [],
		tags: [],
		timeoutMultiplier: 1,
		passType: "blind",
	};
}

function createResult(item: MatrixItem): MatrixItemResult {
	const now = "2026-04-22T00:00:00.000Z";
	return {
		id: item.id,
		runtime: item.runtime,
		model: item.model,
		harness: item.harness,
		test: item.test,
		category: item.category,
		passType: item.passType,
		status: "completed",
		startedAt: now,
		completedAt: now,
		generation: {
			success: true,
			output: "export const ok = true;",
			durationMs: 10,
		},
	};
}

function createPlan(items: MatrixItem[]): RunPlan {
	return {
		schemaVersion: "1",
		runId: "20260422-000000-test",
		createdAt: "2026-04-22T00:00:00.000Z",
		config: {
			ollamaBaseUrl: CONFIG.ollamaBaseUrl,
			generateTimeoutMs: CONFIG.generateTimeoutMs,
			gooseMaxTurns: CONFIG.gooseMaxTurns,
			gooseRetryMaxTurns: CONFIG.gooseRetryMaxTurns,
			gooseWorkspaceMaxTurns: CONFIG.gooseWorkspaceMaxTurns,
			gooseWorkspaceRetryMaxTurns: CONFIG.gooseWorkspaceRetryMaxTurns,
			passTypes: CONFIG.passTypes,
			categories: CONFIG.categories,
		},
		items,
		summary: {
			totalItems: items.length,
			runtimes: 1,
			models: new Set(items.map((item) => item.model)).size,
			harnesses: 1,
			tests: items.length,
			categories: 1,
		},
	};
}

describe("runBenchmark Ollama residency guard", () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks = createMocks();
		mocks.loggerFactory.mockReturnValue(mocks.loggerChild);
		mocks.hasOpenRouterKey.mockReturnValue(false);
		mocks.createRuntime.mockReturnValue({
			getModelInfo: vi.fn().mockResolvedValue({
				name: "model",
				sizeBytes: 0,
				parametersBillions: 7,
			}),
		});
		mocks.writePlan.mockResolvedValue(undefined);
		mocks.writePartialResult.mockResolvedValue(undefined);
		mocks.writeResult.mockResolvedValue(undefined);
		mocks.ensureOnlyOllamaModelLoaded.mockImplementation(async (config) => ({
			...(typeof config.allowedModel === "string"
				? { allowedModel: config.allowedModel }
				: {}),
			loadedModels:
				typeof config.allowedModel === "string" ? [config.allowedModel] : [],
			unloadedModels: [],
		}));
		mocks.executeItem.mockImplementation(async (item: MatrixItem) =>
			createResult(item),
		);
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("guards before each model and unloads after each model boundary", async () => {
		const first = createItem("01", "model-a");
		const second = createItem("02", "model-b");
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([first, second]));
		const { runBenchmark } = await import("../src/runner/index.js");
		await runBenchmark(CONFIG);

		expect(
			mocks.ensureOnlyOllamaModelLoaded.mock.calls.map(([config]) => config),
		).toEqual([
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-a" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-b" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
		]);
		expect(mocks.executeItem).toHaveBeenCalledTimes(2);
		expect(mocks.executeItem.mock.calls[0][3]).toBe(true);
		expect(mocks.executeItem.mock.calls[1][3]).toBe(true);
	});

	it("keeps consecutive same-model rows warm until the final row", async () => {
		const first = createItem("01", "model-a");
		const second = createItem("02", "model-a");
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([first, second]));
		const { runBenchmark } = await import("../src/runner/index.js");

		await runBenchmark(CONFIG);

		expect(
			mocks.ensureOnlyOllamaModelLoaded.mock.calls.map(([config]) => config),
		).toEqual([
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-a" },
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-a" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
		]);
		expect(mocks.executeItem.mock.calls[0][3]).toBe(false);
		expect(mocks.executeItem.mock.calls[1][3]).toBe(true);
	});

	it("skips rows after failed tool preflight and unloads at the model boundary", async () => {
		const preflight = {
			...createItem("01", "model-a"),
			harness: "opencode",
			tags: ["preflight"],
		} satisfies MatrixItem;
		const skipped = {
			...createItem("02", "model-a"),
			harness: "opencode",
		} satisfies MatrixItem;
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([preflight, skipped]));
		mocks.executeItem.mockResolvedValueOnce({
			...createResult(preflight),
			status: "failed",
			generation: {
				success: false,
				error: "permission tool unavailable",
				failureType: "tool_missing",
				durationMs: 11,
			},
			generationFailure: {
				type: "tool_missing",
				message: "permission tool unavailable",
			},
		});
		const { runBenchmark } = await import("../src/runner/index.js");
		await runBenchmark(CONFIG);
		expect(mocks.executeItem).toHaveBeenCalledTimes(1);
		expect(mocks.writePartialResult).toHaveBeenCalledTimes(1);
		expect(
			mocks.ensureOnlyOllamaModelLoaded.mock.calls.map(([config]) => config),
		).toEqual([
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-a" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
		]);
		const runResult = mocks.writeResult.mock.calls[0]?.[1] as {
			items: MatrixItemResult[];
		};
		expect(runResult.items[1]).toMatchObject({
			id: skipped.id,
			status: "failed",
			generation: {
				success: false,
				error: "Skipped: permission tool unavailable",
				failureType: "tool_missing",
				durationMs: 0,
			},
			signalAssessment: {
				classification: "tainted",
				reasons: ["preflight_skip"],
			},
		});
	});

	it("continues after model-behavior preflight harness errors", async () => {
		const preflight = {
			...createItem("01", "model-a"),
			harness: "hermes",
			tags: ["preflight"],
		} satisfies MatrixItem;
		const nextItem = {
			...createItem("02", "model-a"),
			harness: "hermes",
		} satisfies MatrixItem;
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([preflight, nextItem]));
		mocks.executeItem
			.mockResolvedValueOnce({
				...createResult(preflight),
				status: "failed",
				generation: {
					success: false,
					error:
						"Hermes printed textual tool-call syntax instead of invoking workspace tools",
					failureType: "harness_error",
					durationMs: 11,
				},
				generationFailure: {
					type: "harness_error",
					message:
						"Hermes printed textual tool-call syntax instead of invoking workspace tools",
				},
			})
			.mockResolvedValueOnce(createResult(nextItem));
		const { runBenchmark } = await import("../src/runner/index.js");
		await runBenchmark(CONFIG);
		expect(mocks.executeItem).toHaveBeenCalledTimes(2);
		expect(mocks.writePartialResult).toHaveBeenCalledTimes(1);
		const [, runResult] = mocks.writeResult.mock.calls[0] as [
			string,
			{ items: MatrixItemResult[] },
		];
		expect(runResult.items[1]).toMatchObject({
			id: nextItem.id,
			status: "completed",
		});
	});

	it("does not execute an item when the pre-item guard fails", async () => {
		const item = createItem("01", "model-a");
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([item]));
		mocks.ensureOnlyOllamaModelLoaded.mockRejectedValueOnce(
			new Error("residency failed"),
		);
		const { runBenchmark } = await import("../src/runner/index.js");

		await expect(runBenchmark(CONFIG)).resolves.toBeUndefined();
		expect(mocks.executeItem).not.toHaveBeenCalled();
		expect(mocks.writeResult).toHaveBeenCalledTimes(1);
		const [, runResult] = mocks.writeResult.mock.calls[0] as [
			string,
			{ items: MatrixItemResult[] },
		];
		expect(runResult.items).toHaveLength(1);
		expect(runResult.items[0]).toMatchObject({
			id: item.id,
			status: "failed",
			generation: {
				success: false,
				error: expect.stringContaining("residency failed"),
				failureType: "api_error",
				durationMs: 0,
			},
			generationFailure: {
				type: "api_error",
				message: expect.stringContaining("residency failed"),
			},
			signalAssessment: {
				classification: "tainted",
				reasons: ["residency_guard_failure"],
			},
		});
	});

	it("drains stale loaded models and retries a pre-item residency timeout once", async () => {
		const item = createItem("01", "model-b");
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([item]));
		mocks.ensureOnlyOllamaModelLoaded
			.mockRejectedValueOnce(
				new Error(
					"Timed out waiting for Ollama model residency; allowed=model-b stillLoaded=model-a",
				),
			)
			.mockResolvedValueOnce({
				loadedModels: [],
				unloadedModels: ["model-a"],
			})
			.mockResolvedValueOnce({
				allowedModel: "model-b",
				loadedModels: ["model-b"],
				unloadedModels: [],
			})
			.mockResolvedValueOnce({
				loadedModels: [],
				unloadedModels: ["model-b"],
			});
		const { runBenchmark } = await import("../src/runner/index.js");

		await runBenchmark(CONFIG);

		expect(
			mocks.ensureOnlyOllamaModelLoaded.mock.calls.map(([config]) => config),
		).toEqual([
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-b" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
			{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-b" },
			{ baseUrl: CONFIG.ollamaBaseUrl, settleTimeoutMs: 1_200_000 },
		]);
		expect(mocks.executeItem).toHaveBeenCalledTimes(1);
		expect(mocks.writeResult).toHaveBeenCalledTimes(1);
		const [, runResult] = mocks.writeResult.mock.calls[0] as [
			string,
			{ items: MatrixItemResult[] },
		];
		expect(runResult.items).toHaveLength(1);
		expect(runResult.items[0]).toMatchObject({
			id: item.id,
			status: "completed",
		});
	});

	it("caches failed preflight residency guards and skips later tool rows", async () => {
		const preflight = {
			...createItem("01", "model-a"),
			harness: "opencode",
			tags: ["preflight"],
		} satisfies MatrixItem;
		const skipped = {
			...createItem("02", "model-a"),
			harness: "opencode",
		} satisfies MatrixItem;
		mocks.buildRunPlan.mockResolvedValueOnce(createPlan([preflight, skipped]));
		mocks.ensureOnlyOllamaModelLoaded.mockRejectedValueOnce(
			new Error("residency failed"),
		);
		const { runBenchmark } = await import("../src/runner/index.js");

		await expect(runBenchmark(CONFIG)).resolves.toBeUndefined();

		expect(mocks.writePartialResult).toHaveBeenCalledTimes(1);
		expect(
			mocks.ensureOnlyOllamaModelLoaded.mock.calls.map(([config]) => config),
		).toEqual([{ baseUrl: CONFIG.ollamaBaseUrl, allowedModel: "model-a" }]);
		expect(mocks.executeItem).not.toHaveBeenCalled();
		const [, runResult] = mocks.writeResult.mock.calls[0] as [
			string,
			{ items: MatrixItemResult[] },
		];
		expect(runResult.items[0]).toMatchObject({
			id: preflight.id,
			status: "failed",
			generationFailure: {
				type: "api_error",
				message: expect.stringContaining("residency failed"),
			},
		});
		expect(runResult.items[1]).toMatchObject({
			id: skipped.id,
			status: "failed",
			generation: {
				success: false,
				error: "Skipped: Residency guard failed: residency failed",
				failureType: "api_error",
				durationMs: 0,
			},
		});
	});

	afterEach(() => {
		consoleLogSpy?.mockRestore();
	});
});
