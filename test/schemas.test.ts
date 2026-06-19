/**
 * Purpose: Test Zod schema validation for config, plan, and result schemas.
 */

import { describe, expect, it } from "vitest";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "../src/lib/machine-profile/normalization.js";
import { getModelIdentityKey } from "../src/lib/model-profiles.js";
import {
	AcceleratorDetectionSchema,
	ArtifactRuntimeNameSchema,
	BenchConfigSchema,
	FrontierEvalFailureTypeSchema,
	HardwareProfileSchema,
	HarnessCapabilitySchema,
	MatrixItemResultSchema,
	MatrixItemSchema,
	PassTypeSchema,
	RunPlanSchema,
	RunResultSchema,
	SCHEMA_VERSION,
	ScoringSpecSchema,
	SupportedRuntimeNameSchema,
	TestCategorySchema,
	TestScoringModeSchema,
	defaultConfig,
	migrateLegacySupportedRuntimeNames,
} from "../src/schemas/index.js";

const TEST_HARDWARE = {
	platform: "darwin",
	arch: "arm64",
	osRelease: "24.3.0",
	cpuModelRaw: "Apple M4 Pro",
	logicalCores: 14,
	totalMemoryBytes: 68_719_476_736,
	accelerators: [
		{
			vendor: "Apple",
			modelRaw: "Apple M4 Pro GPU",
			kind: "integrated" as const,
			backend: "metal",
		},
	],
	acceleratorDetection: {
		status: "detected" as const,
	},
};
const TEST_NORMALIZED_PROFILE = normalizeMachineProfile(TEST_HARDWARE);
const TEST_PROFILE_KEY = buildMachineProfileKey(TEST_NORMALIZED_PROFILE);
const TEST_PROFILE_LABEL = buildMachineProfileLabel(
	TEST_HARDWARE,
	TEST_NORMALIZED_PROFILE,
);

describe("common schemas", () => {
	it("should validate pass types", () => {
		expect(PassTypeSchema.parse("blind")).toBe("blind");
		expect(PassTypeSchema.parse("informed")).toBe("informed");
		expect(() => PassTypeSchema.parse("unknown")).toThrow();
	});

	it("should export schema version", () => {
		expect(SCHEMA_VERSION).toBe("0.5.3");
	});

	it("should validate supported and artifact runtime names separately", () => {
		expect(SupportedRuntimeNameSchema.parse("ollama")).toBe("ollama");
		expect(() => SupportedRuntimeNameSchema.parse("vllm")).toThrow();
		expect(ArtifactRuntimeNameSchema.parse("ollama")).toBe("ollama");
		expect(ArtifactRuntimeNameSchema.parse("vllm")).toBe("vllm");
		expect(() => ArtifactRuntimeNameSchema.parse("unknown")).toThrow();
	});

	it("should migrate legacy config runtime names to active runtimes", () => {
		expect(migrateLegacySupportedRuntimeNames(["vllm"])).toEqual(["ollama"]);
		expect(migrateLegacySupportedRuntimeNames(["ollama", "vllm"])).toEqual([
			"ollama",
		]);
		expect(
			BenchConfigSchema.parse({
				schemaVersion: "0.5.2",
				runtimes: ["vllm"],
			}).runtimes,
		).toEqual(["ollama"]);
	});

	it("should validate frontier eval failure types", () => {
		expect(FrontierEvalFailureTypeSchema.parse("timeout")).toBe("timeout");
		expect(() => FrontierEvalFailureTypeSchema.parse("not-a-type")).toThrow();
	});

	it("should validate test categories", () => {
		expect(TestCategorySchema.parse("coding")).toBe("coding");
		expect(TestCategorySchema.parse("computer-use")).toBe("computer-use");
		expect(() => TestCategorySchema.parse("ops")).toThrow();
	});

	it("should validate test scoring modes", () => {
		expect(TestScoringModeSchema.parse("code-module")).toBe("code-module");
		expect(TestScoringModeSchema.parse("workspace")).toBe("workspace");
		expect(() => TestScoringModeSchema.parse("browser")).toThrow();
	});

	it("should validate harness capabilities", () => {
		expect(HarnessCapabilitySchema.parse("workspace-read")).toBe(
			"workspace-read",
		);
		expect(HarnessCapabilitySchema.parse("workspace-mkdir")).toBe(
			"workspace-mkdir",
		);
		expect(() => HarnessCapabilitySchema.parse("browser-click")).toThrow();
	});
});

describe("BenchConfigSchema", () => {
	it("should parse empty object with defaults", () => {
		const config = BenchConfigSchema.parse({});
		expect(config.runtimes).toEqual(["ollama"]);
		expect(config.models).toEqual([]);
		expect(config.harnesses).toEqual([]);
		expect(config.tests).toEqual([]);
		expect(config.categories).toEqual([]);
		expect(config.passTypes).toEqual(["blind", "informed"]);
		expect(config.ollamaBaseUrl).toBe("http://localhost:11434");
		expect(config.generateTimeoutMs).toBe(300_000);
		expect(config.gooseMaxTurns).toBe(1);
		expect(config.gooseRetryMaxTurns).toBe(3);
		expect(config.gooseWorkspaceMaxTurns).toBe(8);
		expect(config.gooseWorkspaceRetryMaxTurns).toBe(12);
		expect(config.hermesMaxTurns).toBe(1);
		expect(config.hermesRetryMaxTurns).toBe(3);
		expect(config.hermesWorkspaceMaxTurns).toBe(8);
		expect(config.hermesWorkspaceRetryMaxTurns).toBe(12);
		expect(config.outputDir).toBe("results");
	});

	it("should parse custom values", () => {
		const config = BenchConfigSchema.parse({
			runtimes: ["ollama"],
			models: ["llama3.2:3b"],
			tests: ["smoke"],
			categories: ["coding"],
			passTypes: ["blind"],
			generateTimeoutMs: 60_000,
			gooseMaxTurns: 2,
			gooseRetryMaxTurns: 4,
			gooseWorkspaceMaxTurns: 6,
			gooseWorkspaceRetryMaxTurns: 9,
			hermesMaxTurns: 2,
			hermesRetryMaxTurns: 4,
			hermesWorkspaceMaxTurns: 6,
			hermesWorkspaceRetryMaxTurns: 9,
		});
		expect(config.runtimes).toEqual(["ollama"]);
		expect(config.models).toEqual(["llama3.2:3b"]);
		expect(config.tests).toEqual(["smoke"]);
		expect(config.categories).toEqual(["coding"]);
		expect(config.passTypes).toEqual(["blind"]);
		expect(config.generateTimeoutMs).toBe(60_000);
		expect(config.gooseMaxTurns).toBe(2);
		expect(config.gooseRetryMaxTurns).toBe(4);
		expect(config.gooseWorkspaceMaxTurns).toBe(6);
		expect(config.gooseWorkspaceRetryMaxTurns).toBe(9);
		expect(config.hermesMaxTurns).toBe(2);
		expect(config.hermesRetryMaxTurns).toBe(4);
		expect(config.hermesWorkspaceMaxTurns).toBe(6);
		expect(config.hermesWorkspaceRetryMaxTurns).toBe(9);
	});

	it("should reject empty runtime selections", () => {
		expect(() => BenchConfigSchema.parse({ runtimes: [] })).toThrow(
			"runtimes must include at least one runtime",
		);
	});

	it("should reject invalid URL", () => {
		expect(() =>
			BenchConfigSchema.parse({ ollamaBaseUrl: "not-a-url" }),
		).toThrow();
	});

	it("should reject goose retry turns lower than initial turns", () => {
		expect(() =>
			BenchConfigSchema.parse({
				gooseMaxTurns: 4,
				gooseRetryMaxTurns: 2,
			}),
		).toThrow(/gooseRetryMaxTurns/);
	});

	it("should reject workspace goose retry turns lower than initial turns", () => {
		expect(() =>
			BenchConfigSchema.parse({
				gooseWorkspaceMaxTurns: 6,
				gooseWorkspaceRetryMaxTurns: 4,
			}),
		).toThrow(/gooseWorkspaceRetryMaxTurns/);
	});

	it("should reject hermes retry turns lower than initial turns", () => {
		expect(() =>
			BenchConfigSchema.parse({
				hermesMaxTurns: 4,
				hermesRetryMaxTurns: 2,
			}),
		).toThrow(/hermesRetryMaxTurns/);
	});

	it("should reject workspace hermes retry turns lower than initial turns", () => {
		expect(() =>
			BenchConfigSchema.parse({
				hermesWorkspaceMaxTurns: 6,
				hermesWorkspaceRetryMaxTurns: 4,
			}),
		).toThrow(/hermesWorkspaceRetryMaxTurns/);
	});

	it("should normalize deprecated machine config aliases", () => {
		const config = BenchConfigSchema.parse({
			machineProfileId: "legacy-machine",
			machineLabel: "Legacy Label",
		});
		expect(config.machineInstanceId).toBe("legacy-machine");
		expect(config.machineDisplayLabel).toBe("Legacy Label");
		expect("machineProfileId" in config).toBe(false);
		expect("machineLabel" in config).toBe(false);
	});

	it("should treat explicit undefined canonical machine fields as absent during alias backfill", () => {
		const config = BenchConfigSchema.parse({
			machineInstanceId: undefined,
			machineProfileId: "legacy-machine",
			machineDisplayLabel: undefined,
			machineLabel: "Legacy Label",
			modelProfiles: undefined,
			modelAliases: {
				"qwen3-8b-instruct": {
					ollama: "qwen3:8b",
				},
			},
		});
		expect(config.machineInstanceId).toBe("legacy-machine");
		expect(config.machineDisplayLabel).toBe("Legacy Label");
		expect(config.modelProfiles["qwen3-8b-instruct"]?.variants.ollama).toBe(
			"qwen3:8b",
		);
	});

	it("should normalize deprecated modelAliases into modelProfiles", () => {
		const config = BenchConfigSchema.parse({
			modelAliases: {
				"qwen3-8b-instruct": {
					ollama: "qwen3:8b",
				},
			},
		});
		expect(config.modelProfiles["qwen3-8b-instruct"]?.variants.ollama).toBe(
			"qwen3:8b",
		);
		expect("modelAliases" in config).toBe(false);
	});

	it("should reject removed vllm config fields including legacy runtime values and profile variants", () => {
		expect(() =>
			BenchConfigSchema.parse({
				vllmBaseUrl: "http://localhost:8000",
			}),
		).toThrow(/vllmBaseUrl/);
		expect(() => BenchConfigSchema.parse({ runtimes: ["vllm"] })).toThrow(
			/runtimes|vllm/,
		);
		expect(() =>
			BenchConfigSchema.parse({
				modelProfiles: {
					"qwen3-8b-instruct": {
						variants: {
							ollama: "qwen3:8b",
							vllm: "Qwen/Qwen3-8B-Instruct",
						},
					},
				},
			}),
		).toThrow();
	});

	it("should reject simultaneous modelProfiles and modelAliases", () => {
		const result = BenchConfigSchema.safeParse({
			modelProfiles: {
				"qwen3-8b-instruct": {
					variants: {
						ollama: "qwen3:8b",
					},
				},
			},
			modelAliases: {
				"qwen3-8b-instruct": {
					ollama: "qwen3:8b",
				},
			},
		});
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected BenchConfigSchema.safeParse to fail");
		}
		expect(
			result.error.issues.some((issue) =>
				issue.message.includes(
					'Bench config must not specify both "modelProfiles" and deprecated "modelAliases"',
				),
			),
		).toBe(true);
	});

	it("should reject conflicting canonical and deprecated machine config aliases", () => {
		expect(() =>
			BenchConfigSchema.parse({
				machineInstanceId: "machine-a",
				machineProfileId: "machine-b",
			}),
		).toThrow(/Conflicting bench config machine IDs/);
		expect(() =>
			BenchConfigSchema.parse({
				machineDisplayLabel: "Label A",
				machineLabel: "Label B",
			}),
		).toThrow(/Conflicting bench config machine labels/);
	});

	it("should reject blank machine config strings before alias backfill", () => {
		const result = BenchConfigSchema.safeParse({
			machineInstanceId: "   ",
			machineProfileId: "legacy-machine",
		});
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected BenchConfigSchema.safeParse to fail");
		}
		expect(
			result.error.issues.some(
				(issue) => issue.path[0] === "machineInstanceId",
			),
		).toBe(true);
	});

	it("should reject non-string canonical machine fields before alias backfill", () => {
		const idResult = BenchConfigSchema.safeParse({
			machineInstanceId: 123,
			machineProfileId: "legacy-machine",
		});
		expect(idResult.success).toBe(false);
		if (idResult.success) {
			throw new Error("Expected BenchConfigSchema.safeParse to fail");
		}
		expect(
			idResult.error.issues.some(
				(issue) =>
					issue.path[0] === "machineInstanceId" &&
					issue.code === "invalid_type",
			),
		).toBe(true);

		const labelResult = BenchConfigSchema.safeParse({
			machineDisplayLabel: 123,
			machineLabel: "Legacy Label",
		});
		expect(labelResult.success).toBe(false);
		if (labelResult.success) {
			throw new Error("Expected BenchConfigSchema.safeParse to fail");
		}
		expect(
			labelResult.error.issues.some(
				(issue) =>
					issue.path[0] === "machineDisplayLabel" &&
					issue.code === "invalid_type",
			),
		).toBe(true);
	});

	it("should provide default config", () => {
		expect(defaultConfig.runtimes).toEqual(["ollama"]);
		expect(defaultConfig.harnesses).toEqual([]);
	});
});

describe("MatrixItemSchema", () => {
	it("should validate a matrix item", () => {
		const item = MatrixItemSchema.parse({
			id: "01",
			runtime: "ollama",
			model: "llama3.2:3b",
			modelProfile: {
				canonical: {
					profileKey: "llama3.2-3b-instruct",
					profileLabel: "Llama 3.2 3B Instruct",
					family: "llama3.2",
					parametersBillions: 3,
					parameterScaleLabel: "3B",
					tuning: "instruct",
				},
				variant: {
					variantKey: "ollama-llama3-2-3b",
					variantLabel: "llama3.2:3b",
					runtime: "ollama",
					runtimeModelName: "llama3.2:3b",
				},
				resolutionSource: "configured_profile",
			},
			harness: "direct",
			test: "smoke",
			category: "coding",
			scoringMode: "code-module",
			requiresTools: false,
			requiredHarnessCapabilities: [],
			tags: [],
			passType: "blind",
		});
		expect(item.id).toBe("01");
		expect(item.runtime).toBe("ollama");
		expect(item.model).toBe("llama3.2:3b");
		expect(item.modelProfile?.canonical.profileKey).toBe(
			"llama3.2-3b-instruct",
		);
		expect(item.scoringMode).toBe("code-module");
	});
});

describe("HardwareProfileSchema", () => {
	it("requires detail when accelerator detection is unavailable", () => {
		const result = AcceleratorDetectionSchema.safeParse({
			status: "unavailable",
		});
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected AcceleratorDetectionSchema.safeParse to fail");
		}
		expect(
			result.error.issues.some(
				(issue) =>
					issue.path[0] === "detail" &&
					issue.message.includes(
						'requires detail when status is "unavailable"',
					),
			),
		).toBe(true);
	});

	it("should reject detected accelerators with an empty accelerator list", () => {
		expect(() =>
			HardwareProfileSchema.parse({
				...TEST_HARDWARE,
				accelerators: [],
				acceleratorDetection: {
					status: "detected",
				},
			}),
		).toThrow(/must contain at least one accelerator/);
	});

	it("should reject none_detected accelerators with a non-empty accelerator list", () => {
		const result = HardwareProfileSchema.safeParse({
			...TEST_HARDWARE,
			acceleratorDetection: {
				status: "none_detected",
			},
		});
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected HardwareProfileSchema.safeParse to fail");
		}
		expect(
			result.error.issues.some(
				(issue) =>
					issue.path[0] === "accelerators" &&
					issue.message ===
						'accelerators must be empty when acceleratorDetection.status is "none_detected"',
			),
		).toBe(true);
	});

	it("should classify a confirmed accelerator-free machine as none", () => {
		const normalized = normalizeMachineProfile(
			HardwareProfileSchema.parse({
				...TEST_HARDWARE,
				accelerators: [],
				acceleratorDetection: {
					status: "none_detected",
				},
			}),
		);
		expect(normalized.acceleratorKey).toBe("none");
		expect(normalized.acceleratorCount).toBe(0);
	});

	it("should reject unavailable accelerator detection with a non-empty accelerator list", () => {
		const result = HardwareProfileSchema.safeParse({
			...TEST_HARDWARE,
			acceleratorDetection: {
				status: "unavailable",
				detail: "probe failed",
			},
		});
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected HardwareProfileSchema.safeParse to fail");
		}
		expect(
			result.error.issues.some(
				(issue) =>
					issue.path[0] === "accelerators" &&
					issue.message ===
						'accelerators must be empty when acceleratorDetection.status is "unavailable"',
			),
		).toBe(true);
	});

	it("should preserve explicit accelerator device counts during normalization", () => {
		const normalized = normalizeMachineProfile(
			HardwareProfileSchema.parse({
				...TEST_HARDWARE,
				accelerators: [
					{
						...TEST_HARDWARE.accelerators[0],
						count: 2,
					},
				],
				acceleratorDetection: {
					status: "detected",
				},
			}),
		);
		expect(normalized.acceleratorCount).toBe(2);
		expect(buildMachineProfileKey(normalized)).toContain("_x2");
	});

	it("should distinguish mixed accelerator summaries in profile keys", () => {
		const dual4090 = normalizeMachineProfile(
			HardwareProfileSchema.parse({
				...TEST_HARDWARE,
				accelerators: [
					{
						vendor: "NVIDIA",
						modelRaw: "RTX 4090",
						count: 2,
						kind: "discrete",
					},
				],
				acceleratorDetection: { status: "detected" },
			}),
		);
		const mixed = normalizeMachineProfile(
			HardwareProfileSchema.parse({
				...TEST_HARDWARE,
				accelerators: [
					{
						vendor: "NVIDIA",
						modelRaw: "RTX 4090",
						count: 1,
						kind: "discrete",
					},
					{
						vendor: "NVIDIA",
						modelRaw: "RTX 4060",
						count: 1,
						kind: "discrete",
					},
				],
				acceleratorDetection: { status: "detected" },
			}),
		);

		expect(dual4090.acceleratorSummary).toEqual(["nvidia/rtx-4090:x2"]);
		expect(mixed.acceleratorSummary).toEqual([
			"nvidia/rtx-4060:x1",
			"nvidia/rtx-4090:x1",
		]);
		expect(buildMachineProfileKey(dual4090)).not.toBe(
			buildMachineProfileKey(mixed),
		);
	});
});

describe("RunPlanSchema", () => {
	it("should validate a complete run plan", () => {
		const plan = RunPlanSchema.parse({
			runId: "20260114-143052-abc123",
			createdAt: "2026-01-14T14:30:52.000Z",
			runtimeEnvironment: {
				platform: "darwin",
				bunVersion: "1.0.0",
			},
			machine: {
				instanceId: "machine-a",
				instanceIdSource: "config",
				displayLabel: "Mac Mini M4 Pro",
				profileKey: TEST_PROFILE_KEY,
				profileLabel: TEST_PROFILE_LABEL,
				normalizedProfile: TEST_NORMALIZED_PROFILE,
				observedHardware: TEST_HARDWARE,
			},
			benchmarkCheckpoint: {
				checkpointId: "chk_sha256v1_abc123def456",
				algorithm: "sha256v1",
				manifestHash: "abc123def456",
				assetCount: 42,
				computedAt: "2026-01-14T14:30:52.000Z",
			},
			provenance: {
				verificationStatus: "self_reported",
				source: "local_cli",
			},
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				gooseMaxTurns: 1,
				gooseRetryMaxTurns: 3,
				gooseWorkspaceMaxTurns: 8,
				gooseWorkspaceRetryMaxTurns: 12,
				categories: ["coding"],
				passTypes: ["blind", "informed"],
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					category: "coding",
					scoringMode: "code-module",
					requiresTools: false,
					requiredHarnessCapabilities: [],
					tags: [],
					passType: "blind",
				},
			],
			summary: {
				totalItems: 1,
				runtimes: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
				categories: 1,
			},
		});
		expect(plan.schemaVersion).toBe(SCHEMA_VERSION);
		expect(plan.runId).toBe("20260114-143052-abc123");
		expect(plan.items).toHaveLength(1);
	});
});

describe("ScoringSpecSchema", () => {
	it("rejects empty workspace assertion sets", () => {
		expect(() =>
			ScoringSpecSchema.parse({
				testSlug: "workspace-test",
				mode: "workspace",
				workspace: {},
			}),
		).toThrow("workspace assertions must define at least one check");
	});

	it("rejects unsafe workspace paths", () => {
		expect(() =>
			ScoringSpecSchema.parse({
				testSlug: "workspace-test",
				mode: "workspace",
				workspace: {
					requiredPaths: ["../escape.txt"],
				},
			}),
		).toThrow("must be a relative path without '..' segments");
	});

	it("rejects absolute workspace paths and unknown mutation keys", () => {
		expect(() =>
			ScoringSpecSchema.parse({
				testSlug: "workspace-test",
				mode: "workspace",
				workspace: {
					requiredPaths: ["C:/escape.txt"],
				},
			}),
		).toThrow("must be a relative path without '..' segments");

		expect(() =>
			ScoringSpecSchema.parse({
				testSlug: "workspace-test",
				mode: "workspace",
				workspace: {
					mutations: {
						created: ["ok.txt"],
						extra: ["nope.txt"],
					},
				},
			}),
		).toThrow();
	});

	it("adds a default scoring spec schema version", () => {
		const spec = ScoringSpecSchema.parse({
			testSlug: "smoke",
			mode: "code-module",
			expectedExports: ["add"],
		});
		expect(spec.schemaVersion).toBe(1);
	});
});

describe("MatrixItemResultSchema", () => {
	it("should validate a successful result", () => {
		const result = MatrixItemResultSchema.parse({
			id: "01",
			runtime: "ollama",
			model: "llama3.2:3b",
			modelAlias: "llama3.2-3b-instruct",
			modelProfile: {
				canonical: {
					profileKey: "llama3.2-3b-instruct",
					profileLabel: "Llama 3.2 3B Instruct",
					family: "llama3.2",
					parametersBillions: 3,
					parameterScaleLabel: "3B",
					tuning: "instruct",
				},
				variant: {
					variantKey: "ollama-llama3-2-3b",
					variantLabel: "llama3.2:3b",
					runtime: "ollama",
					runtimeModelName: "llama3.2:3b",
				},
				resolutionSource: "configured_profile",
			},
			harness: "direct",
			test: "smoke",
			category: "coding",
			passType: "blind",
			status: "completed",
			startedAt: "2026-01-14T14:30:52.000Z",
			completedAt: "2026-01-14T14:31:02.000Z",
			generation: {
				success: true,
				output: "function add(a, b) { return a + b; }",
				durationMs: 10000,
				promptTokens: 50,
				completionTokens: 20,
			},
		});
		expect(result.status).toBe("completed");
		expect(result.generation?.success).toBe(true);
		expect(
			getModelIdentityKey(result.model, result.modelProfile, result.modelAlias),
		).toBe("llama3.2-3b-instruct");
	});

	it("should validate a failed result", () => {
		const result = MatrixItemResultSchema.parse({
			id: "02",
			runtime: "ollama",
			model: "llama3.2:3b",
			harness: "direct",
			test: "smoke",
			category: "coding",
			passType: "informed",
			status: "failed",
			startedAt: "2026-01-14T14:31:02.000Z",
			completedAt: "2026-01-14T14:31:05.000Z",
			generation: {
				success: false,
				error: "Connection timeout",
				durationMs: 3000,
			},
			generationFailure: {
				type: "timeout",
				message: "Connection timeout",
			},
		});
		expect(result.status).toBe("failed");
		expect(result.generation?.success).toBe(false);
		expect(result.generation?.error).toBe("Connection timeout");
	});

	it("should validate a frontier eval failure record", () => {
		const result = MatrixItemResultSchema.parse({
			id: "03",
			runtime: "ollama",
			model: "llama3.2:3b",
			harness: "direct",
			test: "smoke",
			category: "coding",
			passType: "blind",
			status: "completed",
			generation: {
				success: true,
				output: "code here",
				durationMs: 5000,
			},
			frontierEvalFailure: {
				type: "rate_limited",
				message: "OpenRouter rate limit hit",
				status: 429,
				attempts: 2,
			},
		});
		expect(result.frontierEvalFailure?.type).toBe("rate_limited");
	});
});

describe("RunResultSchema", () => {
	it("should validate a complete run result", () => {
		const result = RunResultSchema.parse({
			runId: "20260114-143052-abc123",
			machine: {
				instanceId: "machine-a",
				instanceIdSource: "config",
				profileKey: TEST_PROFILE_KEY,
				profileLabel: TEST_PROFILE_LABEL,
				normalizedProfile: TEST_NORMALIZED_PROFILE,
				observedHardware: TEST_HARDWARE,
			},
			benchmarkCheckpoint: {
				checkpointId: "chk_sha256v1_abc123def456",
				algorithm: "sha256v1",
				manifestHash: "abc123def456",
				assetCount: 42,
				computedAt: "2026-01-14T14:30:52.000Z",
			},
			provenance: {
				verificationStatus: "self_reported",
				source: "local_cli",
			},
			startedAt: "2026-01-14T14:30:52.000Z",
			completedAt: "2026-01-14T14:35:00.000Z",
			durationMs: 248000,
			summary: {
				total: 2,
				completed: 1,
				failed: 1,
				pending: 0,
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					category: "coding",
					passType: "blind",
					status: "completed",
					generation: {
						success: true,
						output: "code here",
						durationMs: 5000,
					},
				},
				{
					id: "02",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					category: "coding",
					passType: "informed",
					status: "failed",
					generation: {
						success: false,
						error: "timeout",
						durationMs: 120000,
					},
				},
			],
		});
		expect(result.schemaVersion).toBe(SCHEMA_VERSION);
		expect(result.summary.total).toBe(2);
		expect(result.items).toHaveLength(2);
	});
});
