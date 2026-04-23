/**
 * Purpose: Regression tests for capability-aware run plan expansion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "../src/schemas/index.js";
import {
	createWorkspaceCapabilityCatalog,
	fallbackCollectMachineProfile,
} from "./utils/fixtures.js";

const discoverHarnessesMock = vi.fn();
const createRuntimeMock = vi.fn();
const discoverTestCatalogMock = vi.fn();
const selectTestsMock = vi.fn();
const computeBenchmarkCheckpointMock = vi.fn();
const collectMachineProfileMock = vi.fn();
const generateRunIdMock = vi.fn();

collectMachineProfileMock.mockImplementation(fallbackCollectMachineProfile);

vi.mock("../src/harnesses/index.js", () => {
	return {
		TOOL_CALLING_HARNESS_NAMES: ["goose", "opencode"],
		discoverHarnesses: discoverHarnessesMock,
		isHarnessCompatibleWithRuntime: () => true,
		isValidHarnessName: () => true,
		normalizeHarnessName: (name: string) => name,
		doesHarnessSupportCapabilities: (
			harness: string,
			requiredCapabilities: string[],
		) => {
			const supported: Record<string, string[]> = {
				direct: [],
				goose: ["workspace-read", "workspace-write"],
				opencode: [
					"workspace-read",
					"workspace-write",
					"workspace-mkdir",
					"workspace-search",
					"workspace-delete",
				],
			};
			return requiredCapabilities.every((capability) =>
				(supported[harness] ?? []).includes(capability),
			);
		},
	};
});

vi.mock("../src/runtimes/index.js", () => {
	return {
		RUNTIME_NAMES: ["ollama"],
		createRuntime: createRuntimeMock,
	};
});

vi.mock("../src/lib/test-catalog.js", () => {
	return {
		discoverTestCatalog: discoverTestCatalogMock,
		selectTests: selectTestsMock,
	};
});

vi.mock("../src/lib/benchmark-checkpoint.js", () => ({
	computeBenchmarkCheckpoint: computeBenchmarkCheckpointMock,
}));

vi.mock("../src/lib/hardware-profile.js", () => ({
	MACHINE_ID_ENV_VAR: "BENCH_MACHINE_ID",
	MACHINE_LABEL_ENV_VAR: "BENCH_MACHINE_LABEL",
	MACHINE_INSTANCE_ID_ENV_VAR: "BENCH_MACHINE_INSTANCE_ID",
	MACHINE_DISPLAY_LABEL_ENV_VAR: "BENCH_MACHINE_DISPLAY_LABEL",
	collectMachineProfile: collectMachineProfileMock,
}));

vi.mock("../src/lib/run-id.js", () => ({
	generateRunId: generateRunIdMock,
}));

describe("buildRunPlan", () => {
	afterEach(() => {
		collectMachineProfileMock.mockReset();
		collectMachineProfileMock.mockImplementation(fallbackCollectMachineProfile);
	});

	beforeEach(() => {
		discoverHarnessesMock.mockReset();
		createRuntimeMock.mockReset();
		discoverTestCatalogMock.mockReset();
		selectTestsMock.mockReset();
		computeBenchmarkCheckpointMock.mockReset();
		collectMachineProfileMock.mockReset();
		generateRunIdMock.mockReset();

		discoverHarnessesMock.mockResolvedValue(["direct", "goose", "opencode"]);
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["qwen3.5:4b"],
			getModelInfo: async (model: string) => ({
				name: model,
				sizeBytes: 4_000_000_000,
				parametersBillions: 4,
				modelKind: "text-generation",
				capabilities: { generateText: true },
			}),
		});
		computeBenchmarkCheckpointMock.mockReturnValue({
			checkpointId: "chk_test",
			algorithm: "sha256v1",
			manifestHash: "abc123",
			assetCount: 1,
			computedAt: "2026-03-13T00:00:00.000Z",
		});
		collectMachineProfileMock.mockReturnValue({
			isAnonymous: false,
			identitySource: "config",
			machine: {
				instanceId: "machine-a",
				instanceIdSource: "config",
				profileKey: "macos_arm64_apple-m4-pro_12c_64gb_apple-m4-pro-gpu_na_x1",
				profileLabel: "Apple M4 Pro / 64GB / Apple M4 Pro GPU",
				normalizedProfile: {
					platformFamily: "macos",
					arch: "arm64",
					cpuVendor: "apple",
					cpuModelKey: "m4-pro",
					logicalCores: 12,
					memoryGiB: 64,
					acceleratorKey: "apple/m4-pro-gpu",
					acceleratorCount: 1,
				},
				observedHardware: {
					platform: "darwin",
					arch: "arm64",
					osRelease: "25.0.0",
					cpuModelRaw: "Apple M4 Pro",
					logicalCores: 12,
					totalMemoryBytes: 68_719_476_736,
					accelerators: [
						{
							vendor: "Apple",
							modelRaw: "Apple M4 Pro GPU",
							kind: "integrated",
							backend: "metal",
						},
					],
					acceleratorDetection: {
						status: "detected",
					},
				},
			},
		});
		generateRunIdMock.mockReturnValue("run-123");
	});

	it("filters harnesses by declared workspace capabilities and keeps preflights single-pass", async () => {
		const catalog = createWorkspaceCapabilityCatalog();
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");
		const plan = await buildRunPlan({
			schemaVersion: SCHEMA_VERSION,
			runtimes: ["ollama"],
			models: ["qwen3.5:4b"],
			harnesses: ["direct", "goose", "opencode"],
			tests: [],
			categories: [],
			passTypes: ["blind", "informed"],
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 300_000,
			gooseMaxTurns: 1,
			gooseRetryMaxTurns: 3,
			gooseWorkspaceMaxTurns: 8,
			gooseWorkspaceRetryMaxTurns: 12,
			outputDir: "results",
			modelProfiles: {},
		});

		const rows = plan.items.map((item) => ({
			harness: item.harness,
			test: item.test,
			passType: item.passType,
		}));

		expect(rows).toContainEqual({
			harness: "goose",
			test: "workspace-tool-smoke",
			passType: "blind",
		});
		expect(rows).toContainEqual({
			harness: "opencode",
			test: "file-delete-smoke",
			passType: "blind",
		});
		expect(rows).toContainEqual({
			harness: "goose",
			test: "targeted-edit",
			passType: "informed",
		});

		expect(
			rows.some(
				(row) => row.harness === "goose" && row.test === "file-search-smoke",
			),
		).toBe(false);
		expect(
			rows.some(
				(row) => row.harness === "goose" && row.test === "safe-cleanup",
			),
		).toBe(false);
		expect(
			rows.some(
				(row) =>
					row.harness === "direct" && row.test === "workspace-tool-smoke",
			),
		).toBe(false);

		expect(
			rows.filter((row) => row.test === "workspace-tool-smoke"),
		).toHaveLength(2);
		expect(rows.filter((row) => row.test === "targeted-edit")).toHaveLength(4);
		expect(plan.items[0].test).toBe("tool-smoke");
		expect(
			plan.items.find(
				(item) => item.test === "targeted-edit" && item.harness === "goose",
			)?.timeoutMultiplier,
		).toBe(1.2);
		expect(plan.config).not.toHaveProperty("vllmBaseUrl");
	});

	it("groups discovered Ollama variants under one canonical model profile", async () => {
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["qwen3:27b"],
		});

		const catalog = [
			{
				slug: "smoke",
				category: "coding",
				description: "basic smoke test",
				tags: [],
				scoringMode: "code-module",
				requiresTools: false,
				requiredHarnessCapabilities: [],
				timeoutMultiplier: 1,
				schemaVersion: 1,
			},
		];
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");
		const plan = await buildRunPlan({
			schemaVersion: SCHEMA_VERSION,
			runtimes: ["ollama"],
			models: ["qwen3-27b-instruct"],
			harnesses: ["direct"],
			tests: [],
			categories: [],
			passTypes: ["blind"],
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 300_000,
			gooseMaxTurns: 1,
			gooseRetryMaxTurns: 3,
			gooseWorkspaceMaxTurns: 8,
			gooseWorkspaceRetryMaxTurns: 12,
			outputDir: "results",
			modelProfiles: {
				"qwen3-27b-instruct": {
					profileLabel: "Qwen 3 27B Instruct",
					family: "qwen3",
					parametersBillions: 27,
					tuning: "instruct",
					variants: {
						ollama: "qwen3:27b",
					},
				},
			},
		});

		expect(plan.summary.models).toBe(1);
		expect(plan.items).toHaveLength(1);
		expect(plan.items.map((item) => item.model)).toEqual(["qwen3:27b"]);
		expect(
			plan.items.map((item) => item.modelProfile?.canonical.profileKey),
		).toEqual(["qwen3-27b-instruct"]);
		expect(plan.items[0].modelProfile?.variant.runtime).toBe("ollama");
	});

	it("dedupes overlapping model selectors that resolve to the same runtime model", async () => {
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["qwen3:27b"],
		});
		const catalog = [
			{
				slug: "smoke",
				category: "coding",
				description: "basic smoke test",
				tags: [],
				scoringMode: "code-module",
				requiresTools: false,
				requiredHarnessCapabilities: [],
				timeoutMultiplier: 1,
				schemaVersion: 1,
			},
		];
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");
		const plan = await buildRunPlan({
			schemaVersion: SCHEMA_VERSION,
			runtimes: ["ollama"],
			models: ["qwen3-27b-instruct", "qwen3:27b"],
			harnesses: ["direct"],
			tests: [],
			categories: [],
			passTypes: ["blind"],
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 300_000,
			gooseMaxTurns: 1,
			gooseRetryMaxTurns: 3,
			gooseWorkspaceMaxTurns: 8,
			gooseWorkspaceRetryMaxTurns: 12,
			outputDir: "results",
			modelProfiles: {
				"qwen3-27b-instruct": {
					profileLabel: "Qwen 3 27B Instruct",
					family: "qwen3",
					parametersBillions: 27,
					tuning: "instruct",
					variants: {
						ollama: "qwen3:27b",
					},
				},
			},
		});

		expect(plan.items).toHaveLength(1);
		expect(plan.items[0]?.model).toBe("qwen3:27b");
	});

	it("fails fast when an explicit model profile lacks an Ollama variant", async () => {
		const catalog = [
			{
				slug: "smoke",
				category: "coding",
				description: "basic smoke test",
				tags: [],
				scoringMode: "code-module",
				requiresTools: false,
				requiredHarnessCapabilities: [],
				timeoutMultiplier: 1,
				schemaVersion: 1,
			},
		];
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");

		await expect(
			buildRunPlan({
				schemaVersion: SCHEMA_VERSION,
				runtimes: ["ollama"],
				models: ["qwen3-27b-instruct"],
				harnesses: ["direct"],
				tests: [],
				categories: [],
				passTypes: ["blind"],
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 300_000,
				gooseMaxTurns: 1,
				gooseRetryMaxTurns: 3,
				gooseWorkspaceMaxTurns: 8,
				gooseWorkspaceRetryMaxTurns: 12,
				outputDir: "results",
				modelProfiles: {
					"qwen3-27b-instruct": {
						profileLabel: "Qwen 3 27B Instruct",
						family: "qwen3",
						parametersBillions: 27,
						tuning: "instruct",
						variants: {},
					},
				},
			}),
		).rejects.toThrow(
			'Configured model profile "qwen3-27b-instruct" does not define a variant for runtime "ollama"',
		);
	});

	it("fails when requested model selectors are not found on any reachable runtime", async () => {
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["qwen3:27b"],
		});
		const catalog = [
			{
				slug: "smoke",
				category: "coding",
				description: "basic smoke test",
				tags: [],
				scoringMode: "code-module",
				requiresTools: false,
				requiredHarnessCapabilities: [],
				timeoutMultiplier: 1,
				schemaVersion: 1,
			},
		];
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");

		await expect(
			buildRunPlan({
				schemaVersion: SCHEMA_VERSION,
				runtimes: ["ollama"],
				models: ["missing-model"],
				harnesses: ["direct"],
				tests: [],
				categories: [],
				passTypes: ["blind"],
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 300_000,
				gooseMaxTurns: 1,
				gooseRetryMaxTurns: 3,
				gooseWorkspaceMaxTurns: 8,
				gooseWorkspaceRetryMaxTurns: 12,
				outputDir: "results",
				modelProfiles: {},
			}),
		).rejects.toThrow("Requested model selectors not found: missing-model");
	});

	it("reports when discovered models are all excluded before matrix expansion", async () => {
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["nomic-embed-text:latest"],
			getModelInfo: async () => ({
				name: "nomic-embed-text:latest",
				sizeBytes: 1_000_000,
				parametersBillions: 0.3,
				capabilities: { generateText: false, embedText: true },
			}),
		});
		discoverTestCatalogMock.mockReturnValue([]);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);
		const { buildRunPlan } = await import("../src/runner/plan-builder.js");
		await expect(
			buildRunPlan({
				schemaVersion: SCHEMA_VERSION,
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
				outputDir: "results",
				modelProfiles: {},
			}),
		).rejects.toThrow("Models were discovered but all were excluded");
	});

	it("fails immediately when Ollama is unreachable", async () => {
		createRuntimeMock.mockReturnValue({
			ping: async () => false,
			listModels: async () => [],
		});
		discoverTestCatalogMock.mockReturnValue([]);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");

		await expect(
			buildRunPlan({
				schemaVersion: SCHEMA_VERSION,
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
				outputDir: "results",
				modelProfiles: {},
			}),
		).rejects.toThrow(/Ollama is not reachable/);
	});
});
