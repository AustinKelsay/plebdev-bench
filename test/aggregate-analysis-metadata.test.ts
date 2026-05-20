/**
 * Purpose: Validate leaderboard aggregate analysis metadata and filters.
 */

import { describe, expect, it } from "vitest";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "../src/lib/machine-profile/normalization.js";
import {
	type AggregateRunInput,
	aggregateRunsForCheckpoint,
} from "../src/results/aggregate.js";
import type { MatrixItemResult, RunResult } from "../src/schemas/index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

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
	acceleratorDetection: { status: "detected" as const },
};
const TEST_NORMALIZED_PROFILE = normalizeMachineProfile(TEST_HARDWARE);
const TEST_PROFILE_KEY = buildMachineProfileKey(TEST_NORMALIZED_PROFILE);
const TEST_PROFILE_LABEL = buildMachineProfileLabel(
	TEST_HARDWARE,
	TEST_NORMALIZED_PROFILE,
);

function createItem(
	id: string,
	completedAt: string,
	overrides: Partial<MatrixItemResult> = {},
): MatrixItemResult {
	return {
		id,
		runtime: "ollama",
		model: "llama3.2:3b",
		harness: "direct",
		test: "smoke",
		passType: "blind",
		status: "completed",
		startedAt: completedAt,
		completedAt,
		generation: {
			success: true,
			output: "code",
			durationMs: 1000,
		},
		automatedScore: {
			passed: 6,
			failed: 0,
			total: 6,
		},
		...overrides,
	};
}

function createRun(
	runId: string,
	checkpointId: string,
	items: MatrixItemResult[],
): RunResult {
	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		machine: {
			instanceId: "instance-a",
			instanceIdSource: "config",
			profileKey: TEST_PROFILE_KEY,
			profileLabel: TEST_PROFILE_LABEL,
			normalizedProfile: TEST_NORMALIZED_PROFILE,
			observedHardware: TEST_HARDWARE,
		},
		benchmarkCheckpoint: {
			checkpointId,
			algorithm: "sha256v1",
			manifestHash: checkpointId,
			assetCount: 12,
			computedAt: "2026-03-04T12:00:00.000Z",
		},
		provenance: {
			verificationStatus: "self_reported",
			source: "local_cli",
		},
		startedAt: items[0]?.startedAt ?? "2026-03-04T12:00:00.000Z",
		completedAt:
			items[items.length - 1]?.completedAt ?? "2026-03-04T12:01:00.000Z",
		durationMs: 60_000,
		summary: {
			total: items.length,
			completed: items.length,
			failed: 0,
			pending: 0,
		},
		items,
	};
}

describe("aggregate analysis metadata", () => {
	it("exposes Best Observed Item selection policy", () => {
		const checkpointId = "chk_sha256v1_selection";
		const aggregate = aggregateRunsForCheckpoint(
			[
				{
					run: createRun("run-a", checkpointId, [
						createItem("01", "2026-03-04T12:00:00.000Z"),
					]),
				},
			],
			checkpointId,
		);

		expect(aggregate.selectionPolicy).toEqual({
			itemSelection: "best_observed_item",
			tieBreaker: "latest_item",
		});
	});

	it("supports trusted-only Signal Assessment filtering without changing default evidence", () => {
		const checkpointId = "chk_sha256v1_signal_filter";
		const trustworthyItem = createItem("01", "2026-03-04T12:00:00.000Z", {
			model: "qwen3:8b",
			signalAssessment: {
				classification: "trustworthy",
				reasons: [],
			},
		});
		const taintedItem = createItem("02", "2026-03-04T12:10:00.000Z", {
			model: "qwen3:14b",
			signalAssessment: {
				classification: "tainted",
				reasons: ["output_contract_violation"],
			},
		});
		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-signal", checkpointId, [
					trustworthyItem,
					taintedItem,
				]),
			},
		];

		const defaultAggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		const trustedOnlyAggregate = aggregateRunsForCheckpoint(
			runs,
			checkpointId,
			{
				signalFilter: "trusted_only",
			},
		);

		expect(defaultAggregate.items).toHaveLength(2);
		expect(defaultAggregate.summary.signalFilter).toEqual({
			mode: "all",
			excludedTaintedItems: 0,
		});
		expect(trustedOnlyAggregate.items).toHaveLength(1);
		expect(trustedOnlyAggregate.items[0]?.model).toBe("qwen3:8b");
		expect(trustedOnlyAggregate.summary.rawItems).toBe(2);
		expect(trustedOnlyAggregate.summary.signalFilter).toEqual({
			mode: "trusted_only",
			excludedTaintedItems: 1,
		});
	});

	it("surfaces Model Profile Resolution provenance on aggregate rows", () => {
		const checkpointId = "chk_sha256v1_model_resolution";
		const configuredItem = createItem("01", "2026-03-04T12:00:00.000Z", {
			model: "qwen3:8b",
			modelProfile: {
				canonical: {
					profileKey: "qwen3-8b-instruct",
					profileLabel: "Qwen 3 8B Instruct",
					family: "qwen3",
					parametersBillions: 8,
					tuning: "instruct",
				},
				variant: {
					variantKey: "ollama-qwen3-8b",
					variantLabel: "qwen3:8b",
					runtime: "ollama",
					runtimeModelName: "qwen3:8b",
				},
				resolutionSource: "configured_profile",
			},
		});
		const legacyAliasItem = createItem("02", "2026-03-04T12:01:00.000Z", {
			model: "llama3.2:3b",
			modelAlias: "llama3.2-3b-instruct",
		});
		const fallbackItem = createItem("03", "2026-03-04T12:02:00.000Z", {
			model: "mistral:7b",
		});

		const aggregate = aggregateRunsForCheckpoint(
			[
				{
					run: createRun("run-model-resolution", checkpointId, [
						configuredItem,
						legacyAliasItem,
						fallbackItem,
					]),
				},
			],
			checkpointId,
		);

		expect(
			aggregate.items.map((item) => [
				item.model,
				item.modelProfileResolutionSource,
			]),
		).toEqual([
			["llama3.2:3b", "legacy_alias"],
			["mistral:7b", "runtime_name"],
			["qwen3:8b", "configured_profile"],
		]);
	});
});
