/**
 * Purpose: Validate checkpoint-aware cross-run aggregation behavior.
 */

import { describe, expect, it } from "vitest";
import {
	aggregateRunsForCheckpoint,
	type AggregateRunInput,
} from "../src/results/aggregate.js";
import type { MatrixItemResult, RunResult } from "../src/schemas/index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

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
	machineProfileId: string,
	items: MatrixItemResult[],
): RunResult {
	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		machine: {
			profileId: machineProfileId,
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
	it("uses latest-run-wins for duplicate machine+matrix keys", () => {
		const checkpointId = "chk_sha256v1_latest";
		const olderItem = createItem("01", "2026-03-04T12:00:00.000Z", {
			automatedScore: { passed: 3, failed: 3, total: 6 },
		});
		const newerItem = createItem("02", "2026-03-04T12:10:00.000Z", {
			automatedScore: { passed: 6, failed: 0, total: 6 },
		});

		const runs: AggregateRunInput[] = [
			{ run: createRun("run-old", checkpointId, "machine-a", [olderItem]) },
			{ run: createRun("run-new", checkpointId, "machine-a", [newerItem]) },
		];

		const aggregate = aggregateRunsForCheckpoint(runs, checkpointId);
		expect(aggregate.items).toHaveLength(1);
		expect(aggregate.items[0].sourceRunId).toBe("run-new");
		expect(aggregate.items[0].automatedScore?.passed).toBe(6);
	});

	it("does not dedupe across different machines", () => {
		const checkpointId = "chk_sha256v1_latest";
		const item = createItem("01", "2026-03-04T12:00:00.000Z");
		const runs: AggregateRunInput[] = [
			{ run: createRun("run-a", checkpointId, "machine-a", [item]) },
			{ run: createRun("run-b", checkpointId, "machine-b", [item]) },
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
				run: createRun("run-target", target, "machine-a", [
					createItem("01", "2026-03-04T12:00:00.000Z"),
				]),
			},
			{
				run: createRun("run-other", other, "machine-a", [
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
