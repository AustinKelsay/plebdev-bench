/**
 * Purpose: Regression tests for capability-aware run plan expansion.
 */

import { createHash } from "node:crypto";
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
	machineProfileId?: string;
	machineLabel?: string;
	env?: NodeJS.ProcessEnv;
	hardwareProfile?: {
		platform: string;
		arch: string;
		osRelease: string;
		cpuModel: string;
		logicalCores: number;
		totalMemoryBytes: number;
	};
} = {}) {
	const env = options.env ?? process.env;
	const hardware =
		options.hardwareProfile ?? {
			platform: "darwin",
			arch: "arm64",
			osRelease: "unknown",
			cpuModel: "unknown",
			logicalCores: 1,
			totalMemoryBytes: 1,
		};
	const readNonEmpty = (value: string | undefined) => {
		if (typeof value !== "string") return undefined;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	};
	const profileId =
		readNonEmpty(options.machineProfileId) ??
		readNonEmpty(env.BENCH_MACHINE_ID) ??
		`anon_${createHash("sha256")
			.update(
				[
					hardware.platform,
					hardware.arch,
					hardware.osRelease,
					hardware.cpuModel,
					String(hardware.logicalCores),
					String(hardware.totalMemoryBytes),
				].join("|"),
			)
			.digest("hex")
			.slice(0, 12)}`;
	const label =
		readNonEmpty(options.machineLabel) ??
		readNonEmpty(env.BENCH_MACHINE_LABEL);
	const identitySource =
		readNonEmpty(options.machineProfileId) !== undefined
			? "config"
			: readNonEmpty(env.BENCH_MACHINE_ID) !== undefined
				? "env"
				: "anonymous";

	return {
		machine: {
			profileId,
			...(label ? { label } : {}),
			hardware,
		},
		isAnonymous: identitySource === "anonymous",
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
				profileId: "machine-a",
				hardware: {
					platform: "darwin",
					arch: "arm64",
					osRelease: "25.0.0",
					cpuModel: "Apple M4 Pro",
					logicalCores: 12,
					totalMemoryBytes: 68_719_476_736,
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
			modelAliases: {},
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
	});
