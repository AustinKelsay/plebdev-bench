/**
 * Purpose: Regression tests for capability-aware run plan expansion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const discoverHarnessesMock = vi.fn();
const discoverRuntimesMock = vi.fn();
const createRuntimeMock = vi.fn();
const discoverTestCatalogMock = vi.fn();
const selectTestsMock = vi.fn();
const computeBenchmarkCheckpointMock = vi.fn();
const collectMachineProfileMock = vi.fn();
const generateRunIdMock = vi.fn();

function fallbackCollectMachineProfile(options: {
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	machineProfileId?: string;
	machineLabel?: string;
	env?: NodeJS.ProcessEnv;
	hardwareProfile?: {
		platform: string;
		arch: string;
		osRelease: string;
		cpuModelRaw: string;
		logicalCores: number;
		totalMemoryBytes: number;
		accelerators: Array<{
			modelRaw: string;
			kind: "integrated" | "discrete" | "unknown";
			vendor?: string;
			backend?: string;
		}>;
		acceleratorDetection: {
			status: "detected" | "none_detected" | "unavailable";
		};
	};
} = {}) {
	const env = options.env ?? process.env;
	const hardware =
		options.hardwareProfile ?? {
			platform: "darwin",
			arch: "arm64",
			osRelease: "unknown",
			cpuModelRaw: "unknown",
			logicalCores: 1,
			totalMemoryBytes: 1,
			accelerators: [],
			acceleratorDetection: {
				status: "unavailable" as const,
			},
		};
	const readNonEmpty = (value: string | undefined) => {
		if (typeof value !== "string") return undefined;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	};
	const instanceId =
		readNonEmpty(options.machineInstanceId) ??
		readNonEmpty(options.machineProfileId) ??
		readNonEmpty(env.BENCH_MACHINE_INSTANCE_ID) ??
		readNonEmpty(env.BENCH_MACHINE_ID) ??
		"inst_0123456789abcdef0123456789abcdef";
	const displayLabel =
		readNonEmpty(options.machineDisplayLabel) ??
		readNonEmpty(options.machineLabel) ??
		readNonEmpty(env.BENCH_MACHINE_DISPLAY_LABEL) ??
		readNonEmpty(env.BENCH_MACHINE_LABEL);
	const identitySource =
		readNonEmpty(options.machineInstanceId) !== undefined ||
		readNonEmpty(options.machineProfileId) !== undefined
			? "config"
		: readNonEmpty(env.BENCH_MACHINE_ID) !== undefined
				|| readNonEmpty(env.BENCH_MACHINE_INSTANCE_ID) !== undefined
			? "env"
		: "generated";

	return {
		machine: {
			instanceId,
			instanceIdSource: identitySource,
			...(displayLabel ? { displayLabel } : {}),
			profileKey: "macos_arm64_apple-m4-pro_12c_64gb_apple-m4-pro-gpu_na_x1",
			profileLabel: "Apple M4 Pro / 64GB / Apple M4 Pro GPU",
			normalizedProfile: {
				platformFamily: "macos" as const,
				arch: hardware.arch,
				cpuVendor: "apple",
				cpuModelKey: "m4-pro",
				logicalCores: hardware.logicalCores,
				memoryGiB: 64,
				acceleratorKey: "apple/m4-pro-gpu",
				acceleratorCount: 1,
			},
			observedHardware: hardware,
		},
		isAnonymous: identitySource === "generated",
		identitySource,
	};
}

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
		RUNTIME_NAMES: ["ollama", "vllm"],
		discoverRuntimes: discoverRuntimesMock,
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
		discoverRuntimesMock.mockReset();
		createRuntimeMock.mockReset();
		discoverTestCatalogMock.mockReset();
		selectTestsMock.mockReset();
		computeBenchmarkCheckpointMock.mockReset();
		collectMachineProfileMock.mockReset();
		generateRunIdMock.mockReset();

		discoverHarnessesMock.mockResolvedValue(["direct", "goose", "opencode"]);
		discoverRuntimesMock.mockResolvedValue(["ollama"]);
		createRuntimeMock.mockReturnValue({
			ping: async () => true,
			listModels: async () => ["qwen3.5:4b"],
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
		const catalog = [
				{
					slug: "tool-smoke",
					category: "coding",
					description: "code preflight",
					tags: ["preflight"],
					scoringMode: "code-module",
					requiresTools: false,
					requiredHarnessCapabilities: [],
					timeoutMultiplier: 1,
					schemaVersion: 1,
				},
			{
				slug: "workspace-tool-smoke",
				category: "computer-use",
				description: "workspace preflight",
					tags: ["preflight", "workspace"],
					scoringMode: "workspace",
					requiresTools: true,
					requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
					timeoutMultiplier: 1,
					schemaVersion: 1,
				},
			{
				slug: "file-search-smoke",
				category: "computer-use",
				description: "search preflight",
				tags: ["preflight", "workspace", "search"],
				scoringMode: "workspace",
				requiresTools: true,
					requiredHarnessCapabilities: [
						"workspace-read",
						"workspace-write",
						"workspace-mkdir",
						"workspace-search",
					],
					timeoutMultiplier: 1,
					schemaVersion: 1,
				},
			{
				slug: "file-delete-smoke",
				category: "computer-use",
				description: "delete preflight",
				tags: ["preflight", "workspace", "delete"],
				scoringMode: "workspace",
				requiresTools: true,
					requiredHarnessCapabilities: [
						"workspace-read",
						"workspace-write",
						"workspace-mkdir",
						"workspace-delete",
					],
					timeoutMultiplier: 1,
					schemaVersion: 1,
				},
			{
				slug: "targeted-edit",
				category: "computer-use",
				description: "single file edit",
					tags: ["workspace", "edit"],
					scoringMode: "workspace",
					requiresTools: true,
					requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
					timeoutMultiplier: 1.2,
					schemaVersion: 1,
				},
			{
				slug: "safe-cleanup",
				category: "computer-use",
				description: "delete files safely",
				tags: ["workspace", "delete"],
				scoringMode: "workspace",
				requiresTools: true,
					requiredHarnessCapabilities: [
						"workspace-read",
						"workspace-write",
						"workspace-mkdir",
						"workspace-delete",
					],
					timeoutMultiplier: 1.15,
					schemaVersion: 1,
				},
			];
		discoverTestCatalogMock.mockReturnValue(catalog);
		selectTestsMock.mockImplementation((selectedCatalog) => selectedCatalog);

		const { buildRunPlan } = await import("../src/runner/plan-builder.js");
		const plan = await buildRunPlan({
			schemaVersion: "0.4.0",
			runtimes: ["ollama"],
			models: ["qwen3.5:4b"],
			harnesses: ["direct", "goose", "opencode"],
			tests: [],
			categories: [],
			passTypes: ["blind", "informed"],
			ollamaBaseUrl: "http://localhost:11434",
			vllmBaseUrl: "http://localhost:8000",
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
		});

	it("groups runtime-specific variants under one canonical model profile", async () => {
		createRuntimeMock.mockImplementation((runtimeName: string) => ({
			ping: async () => true,
			listModels: async () =>
				runtimeName === "ollama"
					? ["qwen3:27b"]
					: ["Qwen/Qwen3-27B-Instruct-MLX-4bit"],
		}));

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
			schemaVersion: "0.4.0",
			runtimes: ["ollama", "vllm"],
			models: ["qwen3-27b-instruct"],
			harnesses: ["direct"],
			tests: [],
			categories: [],
			passTypes: ["blind"],
			ollamaBaseUrl: "http://localhost:11434",
			vllmBaseUrl: "http://localhost:8000",
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
						vllm: {
							modelName: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
							format: "MLX",
							quantization: "4-bit",
						},
					},
				},
			},
		});

		expect(plan.summary.models).toBe(1);
		expect(plan.items).toHaveLength(2);
		expect(plan.items.map((item) => item.model)).toEqual([
			"qwen3:27b",
			"Qwen/Qwen3-27B-Instruct-MLX-4bit",
		]);
		expect(
			plan.items.map((item) => item.modelProfile?.canonical.profileKey),
		).toEqual(["qwen3-27b-instruct", "qwen3-27b-instruct"]);
		expect(plan.items[1].modelProfile?.variant.format).toBe("MLX");
		expect(plan.items[1].modelProfile?.variant.quantization).toBe("4-bit");
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
			schemaVersion: "0.4.0",
			runtimes: ["ollama"],
			models: ["qwen3-27b-instruct", "qwen3:27b"],
			harnesses: ["direct"],
			tests: [],
			categories: [],
			passTypes: ["blind"],
			ollamaBaseUrl: "http://localhost:11434",
			vllmBaseUrl: "http://localhost:8000",
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

	it("fails fast when an explicit model profile lacks a runtime variant", async () => {
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
				schemaVersion: "0.4.0",
				runtimes: ["ollama", "vllm"],
				models: ["qwen3-27b-instruct"],
				harnesses: ["direct"],
				tests: [],
				categories: [],
				passTypes: ["blind"],
				ollamaBaseUrl: "http://localhost:11434",
				vllmBaseUrl: "http://localhost:8000",
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
			}),
		).rejects.toThrow(
			'Configured model profile "qwen3-27b-instruct" does not define a variant for runtime "vllm"',
		);
	});
	});
