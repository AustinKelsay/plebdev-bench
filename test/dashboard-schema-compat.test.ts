/**
 * Purpose: Validate dashboard schema compatibility helpers.
 * Exports: none
 *
 * Invariants:
 * - Dashboard schemas accept legacy payloads only through explicit transforms
 * - Dashboard boundary validation mirrors item-level model/signal contracts
 */

import { describe, expect, it } from "vitest";
import {
	DashboardIndexLegacyOrCurrentSchema,
	LeaderboardAggregateSchema,
	RunPlanSchema,
	RunResultSchema,
} from "../apps/dashboard/src/lib/schemas.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

describe("LeaderboardAggregateSchema", () => {
	it("upgrades legacy schemaVersion 1 aggregates to the v2 shape", () => {
		const parsed = LeaderboardAggregateSchema.parse({
			schemaVersion: 1,
			generatedAt: "2026-03-25T12:00:00.000Z",
			checkpointId: "chk_test",
			summary: {
				runsConsidered: 2,
				runsMatched: 2,
				rawItems: 4,
				dedupedItems: 2,
				machines: 1,
				automatedScoreItems: 2,
				frontierEvalItems: 1,
			},
			machines: [
				{
					machineProfileId: "legacy-machine",
					machineLabel: "Legacy Machine",
					verificationStatus: "self_reported",
					runCount: 2,
					itemCount: 2,
				},
			],
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
					status: "completed",
					machineProfileId: "legacy-machine",
					machineLabel: "Legacy Machine",
					verificationStatus: "self_reported",
					sourceRunId: "run-a",
					sourceCompletedAt: "2026-03-25T12:00:00.000Z",
				},
			],
		});

		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.summary.instances).toBe(1);
		expect(parsed.machines[0]?.machineProfileKey).toBe("legacy-machine");
		expect(parsed.machines[0]?.instanceCount).toBe(1);
		expect(parsed.items[0]?.machineProfileKey).toBe("legacy-machine");
		expect(parsed.items[0]?.machineDisplayLabel).toBe("Legacy Machine");
	});

	it("preserves category metadata on current aggregate items", () => {
		const parsed = LeaderboardAggregateSchema.parse({
			schemaVersion: 2,
			generatedAt: "2026-03-30T12:00:00.000Z",
			checkpointId: "chk_test",
			summary: {
				runsConsidered: 1,
				runsMatched: 1,
				rawItems: 1,
				dedupedItems: 1,
				machines: 1,
				instances: 1,
				automatedScoreItems: 1,
				frontierEvalItems: 0,
			},
			machines: [
				{
					machineProfileKey: "machine-a",
					verificationStatus: "self_reported",
					runCount: 1,
					itemCount: 1,
					instanceCount: 1,
				},
			],
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "workspace-smoke",
					category: "computer-use",
					passType: "blind",
					status: "completed",
					machineProfileKey: "machine-a",
					verificationStatus: "self_reported",
					sourceRunId: "run-a",
					sourceCompletedAt: "2026-03-30T12:00:00.000Z",
				},
			],
		});

		expect(parsed.items[0]?.category).toBe("computer-use");
	});
});

describe("DashboardIndexLegacyOrCurrentSchema", () => {
	it("upgrades legacy array dashboard indexes to the v3 object shape", () => {
		const parsed = DashboardIndexLegacyOrCurrentSchema.parse([
			{
				runId: "run-2",
				startedAt: "2026-03-25T12:00:00.000Z",
				completedAt: "2026-03-25T12:05:00.000Z",
				durationMs: 300_000,
				summary: { total: 1, completed: 1, failed: 0, pending: 0 },
				checkpointId: "chk_test",
			},
		]);

		expect(Array.isArray(parsed)).toBe(false);
		if (Array.isArray(parsed)) {
			throw new Error("expected upgraded dashboard index object");
		}
		expect(parsed.schemaVersion).toBe(3);
		expect(parsed.latestCheckpointId).toBe("chk_test");
		expect(parsed.runs).toHaveLength(1);
		expect(parsed.checkpoints).toEqual([]);
	});

	it("upgrades schemaVersion 2 dashboard indexes to the v3 shape", () => {
		const parsed = DashboardIndexLegacyOrCurrentSchema.parse({
			schemaVersion: 2,
			generatedAt: "2026-03-25T12:00:00.000Z",
			latestCheckpointId: "chk_test",
			runs: [],
			checkpoints: [
				{
					checkpointId: "chk_test",
					runCount: 2,
					rawItemCount: 6,
					machineCount: 1,
					latestRunAt: "2026-03-25T12:00:00.000Z",
				},
			],
		});

		expect(Array.isArray(parsed)).toBe(false);
		if (Array.isArray(parsed)) {
			throw new Error("expected upgraded dashboard index object");
		}
		expect(parsed.schemaVersion).toBe(3);
		expect(parsed.checkpoints[0]?.instanceCount).toBe(1);
	});
});

describe("RunResultSchema", () => {
	it("accepts optional model profile and signal assessment metadata on items", () => {
		const parsed = RunResultSchema.parse({
			schemaVersion: SCHEMA_VERSION,
			runId: "run-test",
			startedAt: "2026-03-25T12:00:00.000Z",
			completedAt: "2026-03-25T12:01:00.000Z",
			durationMs: 60_000,
			summary: {
				total: 1,
				completed: 1,
				failed: 0,
				pending: 0,
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3:27b",
					modelAlias: "qwen3-27b-instruct",
					modelProfile: {
						canonical: {
							profileKey: "qwen3-27b-instruct",
							profileLabel: "Qwen 3 27B Instruct",
							family: "qwen3",
							parametersBillions: 27,
							parameterScaleLabel: "27B",
							tuning: "instruct",
						},
						variant: {
							variantKey: "ollama-qwen3-27b",
							variantLabel: "qwen3:27b",
							runtime: "ollama",
							runtimeModelName: "qwen3:27b",
							quantization: "Q4_K_M",
						},
						resolutionSource: "configured_profile",
					},
					harness: "direct",
					test: "smoke",
					passType: "blind",
					status: "completed",
					signalAssessment: {
						classification: "tainted",
						reasons: ["mixed_prose_salvaged"],
					},
				},
			],
		});

		expect(parsed.items[0]?.modelProfile?.canonical.profileKey).toBe(
			"qwen3-27b-instruct",
		);
		expect(parsed.items[0]?.signalAssessment?.classification).toBe("tainted");
	});

	it("rejects runtime tool-version records without status-specific evidence", () => {
		expect(() =>
			RunResultSchema.parse({
				schemaVersion: SCHEMA_VERSION,
				runId: "run-test",
				runtimeEnvironment: {
					platform: "darwin",
					bunVersion: "1.3.3",
					toolVersions: {
						ollama: { status: "detected" },
					},
				},
				startedAt: "2026-03-25T12:00:00.000Z",
				completedAt: "2026-03-25T12:01:00.000Z",
				durationMs: 60_000,
				summary: { total: 0, completed: 0, failed: 0, pending: 0 },
				items: [],
			}),
		).toThrow();
	});

	it("rejects trustworthy signal assessments that include taint reasons", () => {
		expect(() =>
			RunResultSchema.parse({
				schemaVersion: SCHEMA_VERSION,
				runId: "run-test",
				startedAt: "2026-03-25T12:00:00.000Z",
				completedAt: "2026-03-25T12:01:00.000Z",
				durationMs: 60_000,
				summary: {
					total: 1,
					completed: 1,
					failed: 0,
					pending: 0,
				},
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "qwen3:27b",
						harness: "direct",
						test: "smoke",
						passType: "blind",
						status: "completed",
						signalAssessment: {
							classification: "trustworthy",
							reasons: ["tool_call_not_executed"],
						},
					},
				],
			}),
		).toThrow("trustworthy signal assessments must not include taint reasons");
	});

	it("accepts newly added transcript/input taint reasons", () => {
		const parsed = RunResultSchema.parse({
			schemaVersion: SCHEMA_VERSION,
			runId: "run-test",
			startedAt: "2026-03-25T12:00:00.000Z",
			completedAt: "2026-03-25T12:01:00.000Z",
			durationMs: 60_000,
			summary: {
				total: 1,
				completed: 1,
				failed: 0,
				pending: 0,
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3:27b",
					harness: "goose",
					test: "workspace-smoke",
					passType: "blind",
					status: "completed",
					signalAssessment: {
						classification: "tainted",
						reasons: ["internal_tool_transcript", "agent_requested_input"],
					},
				},
			],
		});

		expect(parsed.items[0]?.signalAssessment?.reasons).toEqual([
			"internal_tool_transcript",
			"agent_requested_input",
		]);
	});
});

describe("RunPlanSchema", () => {
	it("preserves legacy vllmBaseUrl config fields for older plan display", () => {
		const parsed = RunPlanSchema.parse({
			schemaVersion: "0.5.0",
			runId: "run-legacy-plan",
			createdAt: "2026-03-25T12:00:00.000Z",
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				vllmBaseUrl: "http://localhost:8000",
				generateTimeoutMs: 300_000,
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
		});

		expect(parsed.config.vllmBaseUrl).toBe("http://localhost:8000");
	});

	it("preserves additive plan fields for dashboard compatibility", () => {
		const parsed = RunPlanSchema.parse({
			schemaVersion: SCHEMA_VERSION,
			runId: "run-additive-plan",
			createdAt: "2026-03-25T12:00:00.000Z",
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 300_000,
				passTypes: ["blind"],
				futureConfigField: "kept",
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3:27b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
					futureItemField: "kept",
				},
			],
			modelExclusions: [
				{
					runtime: "ollama",
					model: "nomic-embed-text",
					reason: "non_generative_model",
					evidence: {
						architecture: "bert",
					},
				},
			],
			summary: {
				totalItems: 1,
				runtimes: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
				categories: 1,
				futureSummaryField: "kept",
			},
			futureTopLevelField: "kept",
		});

		expect(parsed.summary.categories).toBe(1);
		expect(parsed.modelExclusions?.[0]).toMatchObject({
			model: "nomic-embed-text",
			reason: "non_generative_model",
		});
		expect((parsed as Record<string, unknown>).futureTopLevelField).toBe(
			"kept",
		);
		expect((parsed.config as Record<string, unknown>).futureConfigField).toBe(
			"kept",
		);
		expect((parsed.items[0] as Record<string, unknown>).futureItemField).toBe(
			"kept",
		);
		expect((parsed.summary as Record<string, unknown>).futureSummaryField).toBe(
			"kept",
		);
	});
});
