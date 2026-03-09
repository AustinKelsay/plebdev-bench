/**
 * Purpose: Test Zod schema validation for config, plan, and result schemas.
 */

import { describe, expect, it } from "vitest";
import {
	BenchConfigSchema,
	FrontierEvalFailureTypeSchema,
	MatrixItemResultSchema,
	MatrixItemSchema,
	PassTypeSchema,
	RunPlanSchema,
	RunResultSchema,
	RuntimeNameSchema,
	SCHEMA_VERSION,
	ScoringSpecSchema,
	TestCategorySchema,
	TestScoringModeSchema,
	defaultConfig,
} from "../src/schemas/index.js";

describe("common schemas", () => {
	it("should validate pass types", () => {
		expect(PassTypeSchema.parse("blind")).toBe("blind");
		expect(PassTypeSchema.parse("informed")).toBe("informed");
		expect(() => PassTypeSchema.parse("unknown")).toThrow();
	});

	it("should export schema version", () => {
		expect(SCHEMA_VERSION).toBe("0.4.0");
	});

	it("should validate runtime names", () => {
		expect(RuntimeNameSchema.parse("ollama")).toBe("ollama");
		expect(RuntimeNameSchema.parse("vllm")).toBe("vllm");
		expect(() => RuntimeNameSchema.parse("unknown")).toThrow();
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
});

describe("BenchConfigSchema", () => {
	it("should parse empty object with defaults", () => {
		const config = BenchConfigSchema.parse({});
		expect(config.runtimes).toEqual([]);
		expect(config.models).toEqual([]);
		expect(config.harnesses).toEqual([]); // Auto-discover all available
		expect(config.tests).toEqual([]);
		expect(config.categories).toEqual([]);
		expect(config.passTypes).toEqual(["blind", "informed"]);
		expect(config.ollamaBaseUrl).toBe("http://localhost:11434");
		expect(config.generateTimeoutMs).toBe(300_000);
		expect(config.gooseMaxTurns).toBe(1);
		expect(config.gooseRetryMaxTurns).toBe(3);
		expect(config.outputDir).toBe("results");
		expect(config.managedVllm).toBeUndefined();
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
		});
		expect(config.runtimes).toEqual(["ollama"]);
		expect(config.models).toEqual(["llama3.2:3b"]);
		expect(config.tests).toEqual(["smoke"]);
		expect(config.categories).toEqual(["coding"]);
		expect(config.passTypes).toEqual(["blind"]);
		expect(config.generateTimeoutMs).toBe(60_000);
		expect(config.gooseMaxTurns).toBe(2);
		expect(config.gooseRetryMaxTurns).toBe(4);
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

	it("should provide default config", () => {
		expect(defaultConfig.harnesses).toEqual([]); // Auto-discover all available
	});
});

describe("MatrixItemSchema", () => {
	it("should validate a matrix item", () => {
		const item = MatrixItemSchema.parse({
			id: "01",
			runtime: "ollama",
			model: "llama3.2:3b",
			harness: "direct",
			test: "smoke",
			category: "coding",
			scoringMode: "code-module",
			requiresTools: false,
			passType: "blind",
		});
		expect(item.id).toBe("01");
		expect(item.runtime).toBe("ollama");
		expect(item.model).toBe("llama3.2:3b");
		expect(item.scoringMode).toBe("code-module");
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
				profileId: "mac-mini-m4-pro",
				label: "Mac Mini M4 Pro",
				hardware: {
					platform: "darwin",
					arch: "arm64",
					osRelease: "24.3.0",
					cpuModel: "Apple M4 Pro",
					logicalCores: 14,
					totalMemoryBytes: 68_719_476_736,
				},
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
				vllmBaseUrl: "http://localhost:8000",
				generateTimeoutMs: 120_000,
				gooseMaxTurns: 1,
				gooseRetryMaxTurns: 3,
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
				profileId: "mac-mini-m4-pro",
				hardware: {
					platform: "darwin",
					arch: "arm64",
					osRelease: "24.3.0",
					cpuModel: "Apple M4 Pro",
					logicalCores: 14,
					totalMemoryBytes: 68_719_476_736,
				},
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
