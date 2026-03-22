/**
 * Purpose: Validate checkpoint guardrail behavior for compare command.
 * Exports: none
 *
 * Invariants:
 * - Tests are deterministic and filesystem-scoped to temporary directories.
 * - Tests do not depend on network access or mutable external services.
 * - Temporary artifacts are always cleaned up so CI runs remain isolated.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	assertComparableCheckpoints,
	readPlanBestEffort,
	resolveCheckpointId,
} from "../src/cli/compare-command.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";
import type { RunPlan, RunResult } from "../src/schemas/index.js";

describe("assertComparableCheckpoints", () => {
	it("allows matching checkpoints", () => {
		expect(() =>
			assertComparableCheckpoints(
				"chk_sha256v1_aaaaaaaaaaaa",
				"chk_sha256v1_aaaaaaaaaaaa",
				false,
			),
		).not.toThrow();
	});

	it("fails on mismatched checkpoints by default", () => {
		expect(() =>
			assertComparableCheckpoints(
				"chk_sha256v1_aaaaaaaaaaaa",
				"chk_sha256v1_bbbbbbbbbbbb",
				false,
			),
		).toThrow("Checkpoint mismatch");
	});

	it("fails when checkpoint metadata is missing by default", () => {
		expect(() =>
			assertComparableCheckpoints(
				undefined,
				"chk_sha256v1_bbbbbbbbbbbb",
				false,
			),
		).toThrow("Checkpoint metadata missing");
	});

	it("allows mismatched or missing checkpoints when override is enabled", () => {
		expect(() =>
			assertComparableCheckpoints(undefined, "chk_sha256v1_bbbbbbbbbbbb", true),
		).not.toThrow();
		expect(() =>
			assertComparableCheckpoints(
				"chk_sha256v1_aaaaaaaaaaaa",
				"chk_sha256v1_bbbbbbbbbbbb",
				true,
			),
		).not.toThrow();
	});
});

describe("resolveCheckpointId", () => {
	it("prefers run checkpoint metadata over plan checkpoint metadata", () => {
		expect(
			resolveCheckpointId(
				{
					benchmarkCheckpoint: { checkpointId: "run-checkpoint" },
				} as unknown as RunResult,
				{
					benchmarkCheckpoint: { checkpointId: "plan-checkpoint" },
				} as unknown as RunPlan,
			),
		).toBe("run-checkpoint");
	});

	it("falls back to plan checkpoint metadata when run metadata is absent", () => {
		expect(
			resolveCheckpointId(
				{} as unknown as RunResult,
				{
					benchmarkCheckpoint: { checkpointId: "plan-checkpoint" },
				} as unknown as RunPlan,
			),
		).toBe("plan-checkpoint");
	});
});

describe("readPlanBestEffort", () => {
	it("returns undefined when plan file is missing", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-compare-plan-"),
		);
		try {
			expect(readPlanBestEffort(root)).toBeUndefined();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("throws when plan file JSON is invalid", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-compare-plan-"),
		);
		try {
			fs.writeFileSync(path.join(root, "plan.json"), "{invalid", "utf-8");
			expect(() => readPlanBestEffort(root)).toThrow();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("returns parsed plan metadata when plan file is valid", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-compare-plan-"),
		);
		try {
			fs.writeFileSync(
				path.join(root, "plan.json"),
				JSON.stringify(
					{
						schemaVersion: SCHEMA_VERSION,
						runId: "run-abc",
						createdAt: "2026-03-04T12:00:00.000Z",
						config: {
							ollamaBaseUrl: "http://localhost:11434",
							vllmBaseUrl: "http://localhost:8000",
							generateTimeoutMs: 120_000,
							passTypes: ["blind"],
						},
						items: [],
						summary: {
							totalItems: 0,
							runtimes: 0,
							models: 0,
							harnesses: 0,
							tests: 0,
						},
					},
					null,
					2,
				),
				"utf-8",
			);

			const parsed = readPlanBestEffort(root);
			expect(parsed?.runId).toBe("run-abc");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("migrates legacy environment field to runtimeEnvironment", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-compare-plan-"),
		);
		try {
			fs.writeFileSync(
				path.join(root, "plan.json"),
				JSON.stringify(
					{
						schemaVersion: "0.4.0",
						runId: "run-legacy",
						createdAt: "2026-03-04T12:00:00.000Z",
						environment: {
							platform: "darwin",
							bunVersion: "1.3.3",
						},
						config: {
							ollamaBaseUrl: "http://localhost:11434",
							vllmBaseUrl: "http://localhost:8000",
							generateTimeoutMs: 120_000,
							passTypes: ["blind"],
						},
						items: [],
						summary: {
							totalItems: 0,
							runtimes: 0,
							models: 0,
							harnesses: 0,
							tests: 0,
						},
					},
					null,
					2,
				),
				"utf-8",
			);

			const parsed = readPlanBestEffort(root);
			expect(parsed?.runtimeEnvironment?.platform).toBe("darwin");
			expect(parsed?.runtimeEnvironment?.bunVersion).toBe("1.3.3");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
