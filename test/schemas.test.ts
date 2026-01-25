/**
 * Purpose: Test Zod schema validation for config, plan, and result schemas.
 */

import { describe, expect, it } from "vitest";
import {
	BenchConfigSchema,
	MatrixItemResultSchema,
	MatrixItemSchema,
	PassTypeSchema,
	RunPlanSchema,
	RunResultSchema,
	SCHEMA_VERSION,
	defaultConfig,
} from "../src/schemas/index.js";

describe("common schemas", () => {
	it("should validate pass types", () => {
		expect(PassTypeSchema.parse("blind")).toBe("blind");
		expect(PassTypeSchema.parse("informed")).toBe("informed");
		expect(() => PassTypeSchema.parse("unknown")).toThrow();
	});

	it("should export schema version", () => {
		expect(SCHEMA_VERSION).toBe("0.1.0");
	});
});

describe("BenchConfigSchema", () => {
	it("should parse empty object with defaults", () => {
		const config = BenchConfigSchema.parse({});
		expect(config.models).toEqual([]);
		expect(config.harnesses).toEqual([]); // Auto-discover all available
		expect(config.tests).toEqual([]);
		expect(config.passTypes).toEqual(["blind", "informed"]);
		expect(config.ollamaBaseUrl).toBe("http://localhost:11434");
		expect(config.generateTimeoutMs).toBe(300_000);
		expect(config.outputDir).toBe("results");
	});

	it("should parse custom values", () => {
		const config = BenchConfigSchema.parse({
			models: ["llama3.2:3b"],
			tests: ["smoke"],
			passTypes: ["blind"],
			generateTimeoutMs: 60_000,
		});
		expect(config.models).toEqual(["llama3.2:3b"]);
		expect(config.tests).toEqual(["smoke"]);
		expect(config.passTypes).toEqual(["blind"]);
		expect(config.generateTimeoutMs).toBe(60_000);
	});

	it("should reject invalid URL", () => {
		expect(() =>
			BenchConfigSchema.parse({ ollamaBaseUrl: "not-a-url" }),
		).toThrow();
	});

	it("should provide default config", () => {
		expect(defaultConfig.harnesses).toEqual([]); // Auto-discover all available
	});
});

describe("MatrixItemSchema", () => {
	it("should validate a matrix item", () => {
		const item = MatrixItemSchema.parse({
			id: "01",
			model: "llama3.2:3b",
			harness: "ollama",
			test: "smoke",
			passType: "blind",
		});
		expect(item.id).toBe("01");
		expect(item.model).toBe("llama3.2:3b");
	});
});

describe("RunPlanSchema", () => {
	it("should validate a complete run plan", () => {
		const plan = RunPlanSchema.parse({
			runId: "20260114-143052-abc123",
			createdAt: "2026-01-14T14:30:52.000Z",
			environment: {
				platform: "darwin",
				bunVersion: "1.0.0",
				hostname: "test-host",
			},
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				passTypes: ["blind", "informed"],
			},
			items: [
				{
					id: "01",
					model: "llama3.2:3b",
					harness: "ollama",
					test: "smoke",
					passType: "blind",
				},
			],
			summary: {
				totalItems: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
			},
		});
		expect(plan.schemaVersion).toBe(SCHEMA_VERSION);
		expect(plan.runId).toBe("20260114-143052-abc123");
		expect(plan.items).toHaveLength(1);
	});
});

describe("MatrixItemResultSchema", () => {
	it("should validate a successful result", () => {
		const result = MatrixItemResultSchema.parse({
			id: "01",
			model: "llama3.2:3b",
			harness: "ollama",
			test: "smoke",
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
			model: "llama3.2:3b",
			harness: "ollama",
			test: "smoke",
			passType: "informed",
			status: "failed",
			startedAt: "2026-01-14T14:31:02.000Z",
			completedAt: "2026-01-14T14:31:05.000Z",
			generation: {
				success: false,
				error: "Connection timeout",
				durationMs: 3000,
			},
		});
		expect(result.status).toBe("failed");
		expect(result.generation?.success).toBe(false);
		expect(result.generation?.error).toBe("Connection timeout");
	});
});

describe("RunResultSchema", () => {
	it("should validate a complete run result", () => {
		const result = RunResultSchema.parse({
			runId: "20260114-143052-abc123",
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
					model: "llama3.2:3b",
					harness: "ollama",
					test: "smoke",
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
					model: "llama3.2:3b",
					harness: "ollama",
					test: "smoke",
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
