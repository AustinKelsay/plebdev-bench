/**
 * Purpose: Validate checkpoint-aware cross-run aggregation behavior.
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
import type {
	HardwareProfile,
	MatrixItemResult,
	NormalizedMachineProfile,
	RunResult,
} from "../src/schemas/index.js";
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
const WINDOWS_HARDWARE = {
	platform: "win32",
	arch: "x64",
	osRelease: "10.0.22631",
	cpuModelRaw: "Intel(R) Core(TM) i9-13900K",
	cpuVendor: "Intel",
	physicalCores: 24,
	logicalCores: 32,
	totalMemoryBytes: 68_719_476_736,
	accelerators: [
		{
			vendor: "NVIDIA",
			modelRaw: "NVIDIA GeForce RTX 4090",
			memoryBytes: 25_769_803_776,
			backend: "cuda",
			kind: "discrete" as const,
		},
	],
	acceleratorDetection: { status: "detected" as const },
};
const WINDOWS_NORMALIZED_PROFILE = normalizeMachineProfile(WINDOWS_HARDWARE);
const WINDOWS_PROFILE_KEY = buildMachineProfileKey(WINDOWS_NORMALIZED_PROFILE);
const WINDOWS_PROFILE_LABEL = buildMachineProfileLabel(
	WINDOWS_HARDWARE,
	WINDOWS_NORMALIZED_PROFILE,
);

interface RunProfileOverrides {
	profileLabel?: typeof TEST_PROFILE_LABEL;
	normalizedProfile?: NormalizedMachineProfile;
	observedHardware?: HardwareProfile;
}

/**
 * Creates a matrix item for aggregation tests.
 */
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

/**
 * Creates a run result for aggregation tests.
 */
function createRun(
	runId: string,
	checkpointId: string,
	machineProfileKey: string,
	instanceId: string,
	items: MatrixItemResult[],
	profile: RunProfileOverrides = {},
): RunResult {
	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		machine: {
			instanceId,
			instanceIdSource: "config",
			displayLabel: "Machine A",
			profileKey: machineProfileKey,
			profileLabel: profile.profileLabel ?? TEST_PROFILE_LABEL,
			normalizedProfile:
				profile.normalizedProfile ?? TEST_NORMALIZED_PROFILE,
			observedHardware: profile.observedHardware ?? TEST_HARDWARE,
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

describe("aggregateRunsForCheckpoint", () => {
	it("uses best-result-wins for duplicate machine+matrix keys", () => {
		const checkpointId = "chk_sha256v1_latest";
		const olderItem = createItem("01", "2026-03-04T12:00:00.000Z", {
			automatedScore: { passed: 6, failed: 0, total: 6 },
			frontierEval: {
				score: 9,
				reasoning: "best",
				model: "grader",
			},
		});
		const newerItem = createItem("01", "2026-03-04T12:10:00.000Z", {
			automatedScore: { passed: 3, failed: 3, total: 6 },
			frontierEval: {
				score: 4,
				reasoning: "worse",
				model: "grader",
			},
		});

		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-old", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					olderItem,
				]),
			},
			{
				run: createRun("run-new", checkpointId, TEST_PROFILE_KEY, "instance-b", [
					newerItem,
				]),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.items).toHaveLength(1);
		expect(aggregate.items[0].sourceRunId).toBe("run-old");
		expect(aggregate.items[0].automatedScore?.passed).toBe(6);
		expect(aggregate.summary.instances).toBe(2);
		expect(aggregate.machines[0]?.instanceCount).toBe(2);
	});

	it("falls back to latest item when duplicate results are equally strong", () => {
		const checkpointId = "chk_sha256v1_tie";
		const olderItem = createItem("01", "2026-03-04T12:00:00.000Z");
		const newerItem = createItem("01", "2026-03-04T12:10:00.000Z");

		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-old", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					olderItem,
				]),
			},
			{
				run: createRun("run-new", checkpointId, TEST_PROFILE_KEY, "instance-b", [
					newerItem,
				]),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.items).toHaveLength(1);
		expect(aggregate.items[0].sourceRunId).toBe("run-new");
		expect(aggregate.summary.instances).toBe(2);
		expect(aggregate.machines[0]?.instanceCount).toBe(2);
	});

	it("counts repeated runs from the same machine instance only once", () => {
		const checkpointId = "chk_sha256v1_same_instance";
		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-a", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					createItem("01", "2026-03-04T12:00:00.000Z"),
				]),
			},
			{
				run: createRun("run-b", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					createItem("02", "2026-03-04T12:10:00.000Z"),
				]),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.summary.instances).toBe(1);
		expect(aggregate.machines[0]?.instanceCount).toBe(1);
	});

	it("aggregates machine verification status conservatively across runs", () => {
		const checkpointId = "chk_sha256v1_verification";
		const verifiedRun = createRun(
			"run-verified",
			checkpointId,
			TEST_PROFILE_KEY,
			"instance-a",
			[createItem("01", "2026-03-04T12:00:00.000Z")],
		);
		verifiedRun.provenance = {
			verificationStatus: "verified",
			source: "local_cli",
		};
		const rejectedRun = createRun(
			"run-rejected",
			checkpointId,
			TEST_PROFILE_KEY,
			"instance-b",
			[createItem("02", "2026-03-04T12:10:00.000Z")],
		);
		rejectedRun.provenance = {
			verificationStatus: "rejected",
			source: "local_cli",
		};

		const aggregate = aggregateRunsForCheckpoint(
			[{ run: verifiedRun }, { run: rejectedRun }],
			checkpointId,
		);

		expect(aggregate.machines[0]?.verificationStatus).toBe("rejected");
	});

	it("dedupes alias variants under the canonical model profile key", () => {
		const checkpointId = "chk_sha256v1_canonical_model";
		const canonicalProfile = {
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
				runtime: "ollama" as const,
				runtimeModelName: "qwen3:27b",
			},
			resolutionSource: "configured_profile" as const,
		};
		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-a", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					createItem("01", "2026-03-04T12:00:00.000Z", {
						model: "qwen3:27b",
						modelAlias: "qwen3-27b-instruct",
						modelProfile: canonicalProfile,
					}),
				]),
			},
			{
				run: createRun("run-b", checkpointId, TEST_PROFILE_KEY, "instance-b", [
					createItem("01", "2026-03-04T12:10:00.000Z", {
						model: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
						modelAlias: "qwen3-27b-instruct",
						modelProfile: {
							...canonicalProfile,
							variant: {
								...canonicalProfile.variant,
								variantKey: "vllm-qwen3-27b-instruct-mlx-4bit",
								variantLabel: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
								runtime: "ollama",
								runtimeModelName: "Qwen/Qwen3-27B-Instruct-MLX-4bit",
							},
						},
					}),
				]),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.items).toHaveLength(1);
		expect(aggregate.items[0]?.sourceRunId).toBe("run-b");
	});

	it("retains machine summaries for matched runs with zero items", () => {
		const checkpointId = "chk_sha256v1_empty_machine";
		const aggregate = aggregateRunsForCheckpoint(
			[
				{
					run: createRun("run-empty", checkpointId, TEST_PROFILE_KEY, "instance-a", []),
				},
			],
			checkpointId,
		);

		expect(aggregate.machines).toHaveLength(1);
		expect(aggregate.machines[0]?.itemCount).toBe(0);
		expect(aggregate.machines[0]?.runCount).toBe(1);
	});

	it("does not dedupe across different profiles", () => {
		const checkpointId = "chk_sha256v1_latest";
		const item = createItem("01", "2026-03-04T12:00:00.000Z");
		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-a", checkpointId, TEST_PROFILE_KEY, "instance-a", [
					item,
				]),
			},
			{
				run: createRun(
					"run-b",
					checkpointId,
					WINDOWS_PROFILE_KEY,
					"instance-b",
					[item],
					{
						profileLabel: WINDOWS_PROFILE_LABEL,
						normalizedProfile: WINDOWS_NORMALIZED_PROFILE,
						observedHardware: WINDOWS_HARDWARE,
					},
				),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.items).toHaveLength(2);
		expect(aggregate.summary.machines).toBe(2);
	});

	it("excludes runs from non-target checkpoints", () => {
		const target = "chk_sha256v1_target";
		const other = "chk_sha256v1_other";
		const runs: AggregateRunInput[] = [
			{
				run: createRun("run-target", target, TEST_PROFILE_KEY, "instance-a", [
					createItem("01", "2026-03-04T12:00:00.000Z"),
				]),
			},
			{
				run: createRun("run-other", other, TEST_PROFILE_KEY, "instance-a", [
					createItem("01", "2026-03-04T12:00:00.000Z"),
				]),
			},
			{
				run: createRun("run-other-2", other, TEST_PROFILE_KEY, "instance-b", [
					createItem("02", "2026-03-04T12:10:00.000Z"),
				]),
			},
		];

		const aggregate = aggregateRunsForCheckpoint(runs, target);
		expect(aggregate.summary.runsMatched).toBe(1);
		expect(aggregate.items).toHaveLength(1);
		expect(aggregate.items[0].sourceRunId).toBe("run-target");
	});
});
