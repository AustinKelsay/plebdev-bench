/**
 * Purpose: Validate dashboard schema compatibility helpers.
 */

import { describe, expect, it } from "vitest";
import {
	DashboardIndexLegacyOrCurrentSchema,
	LeaderboardAggregateSchema,
	RunResultSchema,
} from "../apps/dashboard/src/lib/schemas.js";

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
});

describe("DashboardIndexLegacyOrCurrentSchema", () => {
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
			schemaVersion: "0.5.0",
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
});
