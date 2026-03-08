/**
 * Purpose: Aggregate benchmark items across runs for a specific checkpoint.
 * Exports: resolveRunMetadata, aggregateRunsForCheckpoint, summarizeCheckpoints
 *
 * Invariants:
 * - Aggregation key is machineProfileId + runtime + model + harness + test + passType
 * - Duplicate keys resolve to the strongest item first, then latest item on exact ties
 * - Outputs are deterministic (stable sorting for items/machines/checkpoints)
 */

import type {
	MatrixItemResult,
	RunPlan,
	RunResult,
	VerificationStatus,
} from "../schemas/index.js";

/** Run input bundle used by index/aggregate generation. */
export interface AggregateRunInput {
	run: RunResult;
	plan?: RunPlan;
}

/** Resolved metadata used for checkpoint and machine-aware aggregation. */
export interface ResolvedRunMetadata {
	checkpointId?: string;
	machineProfileId?: string;
	machineLabel?: string;
	verificationStatus: VerificationStatus;
	isLegacy: boolean;
}

/** Aggregated item with machine/run provenance fields. */
export type AggregatedMatrixItem = MatrixItemResult & {
	machineProfileId: string;
	machineLabel?: string;
	verificationStatus: VerificationStatus;
	sourceRunId: string;
	sourceCompletedAt: string;
};

/** Per-machine summary for a checkpoint aggregate. */
export interface MachineAggregateSummary {
	machineProfileId: string;
	machineLabel?: string;
	verificationStatus: VerificationStatus;
	runCount: number;
	itemCount: number;
}

/** Aggregate summary counters for one checkpoint. */
export interface CheckpointAggregateSummary {
	runsConsidered: number;
	runsMatched: number;
	rawItems: number;
	dedupedItems: number;
	machines: number;
	automatedScoreItems: number;
	frontierEvalItems: number;
}

/** Full aggregate payload for one checkpoint. */
export interface CheckpointAggregate {
	schemaVersion: 1;
	generatedAt: string;
	checkpointId: string;
	summary: CheckpointAggregateSummary;
	machines: MachineAggregateSummary[];
	items: AggregatedMatrixItem[];
}

/** Checkpoint-level summary used by dashboard index metadata. */
export interface CheckpointSummary {
	checkpointId: string;
	runCount: number;
	rawItemCount: number;
	machineCount: number;
	latestRunAt: string;
}

/**
 * Resolves checkpoint/machine/provenance metadata from run/plan artifacts.
 *
 * @param input - Run plus optional plan artifact
 * @returns Normalized run metadata
 */
export function resolveRunMetadata(input: AggregateRunInput): ResolvedRunMetadata {
	const { run, plan } = input;
	const checkpointId =
		run.benchmarkCheckpoint?.checkpointId ?? plan?.benchmarkCheckpoint?.checkpointId;
	const machineProfileId = run.machine?.profileId ?? plan?.machine?.profileId;
	const machineLabel = run.machine?.label ?? plan?.machine?.label;
	const verificationStatus =
		run.provenance?.verificationStatus ??
		plan?.provenance?.verificationStatus ??
		"self_reported";
	const isLegacy = !checkpointId || !machineProfileId;

	return {
		checkpointId,
		machineProfileId,
		machineLabel,
		verificationStatus,
		isLegacy,
	};
}

/**
 * Builds the deterministic aggregation key for one matrix item.
 *
 * @param machineProfileId - Machine profile identifier
 * @param item - Matrix item
 * @returns Stable aggregation key
 */
function buildAggregateKey(
	machineProfileId: string,
	item: MatrixItemResult,
): string {
	return `${machineProfileId}|${item.runtime}|${item.model}|${item.harness}|${item.test}|${item.passType}`;
}

/**
 * Converts timestamp fields into a comparable unix epoch value.
 *
 * @param value - ISO timestamp
 * @returns Epoch milliseconds, or 0 when invalid/missing
 */
function toEpochMs(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Produces a deterministic primary timestamp for latest-wins comparisons.
 *
 * @param run - Run result containing fallback timestamps
 * @param item - Matrix item for per-item timestamps
 * @returns Comparable epoch value
 */
function resolveItemTimestamp(run: RunResult, item: MatrixItemResult): number {
	return Math.max(
		toEpochMs(item.completedAt),
		toEpochMs(item.startedAt),
		toEpochMs(run.completedAt),
		toEpochMs(run.startedAt),
	);
}

/**
 * Assigns an ordering weight to item execution status for best-result selection.
 *
 * @param status - Item execution status
 * @returns Numeric rank where larger means better
 */
function getStatusRank(status: MatrixItemResult["status"]): number {
	switch (status) {
		case "completed":
			return 3;
		case "failed":
			return 2;
		case "running":
			return 1;
		case "pending":
			return 0;
	}
}

/**
 * Produces a comparable pass-rate score for best-result selection.
 *
 * @param item - Matrix item candidate
 * @returns Pass-rate fraction in [0, 1], or -1 when unavailable
 */
function getAutomatedPassRate(item: MatrixItemResult): number {
	if (!item.automatedScore || item.automatedScore.total <= 0) {
		return -1;
	}
	return item.automatedScore.passed / item.automatedScore.total;
}

/**
 * Compares two aggregate candidates for the same machine+matrix key.
 *
 * Ordering rules:
 * - Prefer stronger execution outcome and higher automated score
 * - Prefer higher frontier score when automated results tie
 * - Prefer successful/faster generations only after score-based comparisons
 * - Fall back to newer source timestamps to keep the result deterministic
 *
 * @param candidate - New candidate entry
 * @param incumbent - Existing entry
 * @returns Positive when candidate should replace incumbent
 */
function compareAggregateCandidates(
	candidate: { timestamp: number; aggregated: AggregatedMatrixItem },
	incumbent: { timestamp: number; aggregated: AggregatedMatrixItem },
): number {
	const statusDelta =
		getStatusRank(candidate.aggregated.status) -
		getStatusRank(incumbent.aggregated.status);
	if (statusDelta !== 0) {
		return statusDelta;
	}

	const automatedPassRateDelta =
		getAutomatedPassRate(candidate.aggregated) -
		getAutomatedPassRate(incumbent.aggregated);
	if (automatedPassRateDelta !== 0) {
		return automatedPassRateDelta;
	}

	const automatedPassedDelta =
		(candidate.aggregated.automatedScore?.passed ?? -1) -
		(incumbent.aggregated.automatedScore?.passed ?? -1);
	if (automatedPassedDelta !== 0) {
		return automatedPassedDelta;
	}

	const automatedTotalDelta =
		(candidate.aggregated.automatedScore?.total ?? -1) -
		(incumbent.aggregated.automatedScore?.total ?? -1);
	if (automatedTotalDelta !== 0) {
		return automatedTotalDelta;
	}

	const frontierScoreDelta =
		(candidate.aggregated.frontierEval?.score ?? -1) -
		(incumbent.aggregated.frontierEval?.score ?? -1);
	if (frontierScoreDelta !== 0) {
		return frontierScoreDelta;
	}

	const generationSuccessDelta =
		Number(candidate.aggregated.generation?.success === true) -
		Number(incumbent.aggregated.generation?.success === true);
	if (generationSuccessDelta !== 0) {
		return generationSuccessDelta;
	}

	const candidateDuration = candidate.aggregated.generation?.durationMs;
	const incumbentDuration = incumbent.aggregated.generation?.durationMs;
	if (
		candidateDuration !== undefined &&
		incumbentDuration !== undefined &&
		candidateDuration !== incumbentDuration
	) {
		return incumbentDuration - candidateDuration;
	}

	if (candidate.timestamp !== incumbent.timestamp) {
		return candidate.timestamp - incumbent.timestamp;
	}

	if (
		candidate.aggregated.sourceCompletedAt !==
		incumbent.aggregated.sourceCompletedAt
	) {
		return candidate.aggregated.sourceCompletedAt.localeCompare(
			incumbent.aggregated.sourceCompletedAt,
		);
	}

	return candidate.aggregated.sourceRunId.localeCompare(
		incumbent.aggregated.sourceRunId,
	);
}

/**
 * Sorts aggregated items into deterministic order.
 *
 * @param a - First aggregated item
 * @param b - Second aggregated item
 * @returns Sort comparator result
 */
function sortAggregatedItems(
	a: AggregatedMatrixItem,
	b: AggregatedMatrixItem,
): number {
	const keyA = buildAggregateKey(a.machineProfileId, a);
	const keyB = buildAggregateKey(b.machineProfileId, b);
	if (keyA !== keyB) return keyA.localeCompare(keyB);
	if (a.sourceCompletedAt !== b.sourceCompletedAt) {
		return a.sourceCompletedAt.localeCompare(b.sourceCompletedAt);
	}
	return a.sourceRunId.localeCompare(b.sourceRunId);
}

/**
 * Aggregates run items for a single checkpoint using best-result semantics.
 *
 * @param runs - Run inputs containing run and optional plan artifacts
 * @param checkpointId - Target checkpoint to aggregate
 * @returns Checkpoint aggregate payload
 */
export function aggregateRunsForCheckpoint(
	runs: AggregateRunInput[],
	checkpointId: string,
): CheckpointAggregate {
	const deduped = new Map<
		string,
		{ timestamp: number; aggregated: AggregatedMatrixItem }
	>();
	const matchedRuns = runs.filter((input) => {
		const metadata = resolveRunMetadata(input);
		return metadata.checkpointId === checkpointId;
	});

	let rawItems = 0;

	for (const input of matchedRuns) {
		const metadata = resolveRunMetadata(input);
		const machineProfileId = metadata.machineProfileId ?? `legacy-${input.run.runId}`;

		for (const item of input.run.items) {
			rawItems++;
			const key = buildAggregateKey(machineProfileId, item);
			const timestamp = resolveItemTimestamp(input.run, item);
			const sourceCompletedAt =
				item.completedAt ??
				item.startedAt ??
				input.run.completedAt ??
				input.run.startedAt;
			const aggregated: AggregatedMatrixItem = {
				...item,
				machineProfileId,
				...(metadata.machineLabel ? { machineLabel: metadata.machineLabel } : {}),
				verificationStatus: metadata.verificationStatus,
				sourceRunId: input.run.runId,
				sourceCompletedAt,
			};

			const previous = deduped.get(key);
			if (!previous) {
				deduped.set(key, { timestamp, aggregated });
				continue;
			}

			const shouldReplace =
				compareAggregateCandidates(
					{ timestamp, aggregated },
					previous,
				) > 0;

			if (shouldReplace) {
				deduped.set(key, { timestamp, aggregated });
			}
		}
	}

	const items = [...deduped.values()]
		.map((entry) => entry.aggregated)
		.sort(sortAggregatedItems);

	const machineRunSet = new Map<string, Set<string>>();
	const machineSummary = new Map<
		string,
		{ machineLabel?: string; verificationStatus: VerificationStatus; itemCount: number }
	>();

	for (const input of matchedRuns) {
		const metadata = resolveRunMetadata(input);
		const machineProfileId = metadata.machineProfileId ?? `legacy-${input.run.runId}`;
		const runsForMachine = machineRunSet.get(machineProfileId) ?? new Set<string>();
		runsForMachine.add(input.run.runId);
		machineRunSet.set(machineProfileId, runsForMachine);
	}

	for (const item of items) {
		const current = machineSummary.get(item.machineProfileId);
		if (!current) {
			machineSummary.set(item.machineProfileId, {
				machineLabel: item.machineLabel,
				verificationStatus: item.verificationStatus,
				itemCount: 1,
			});
			continue;
		}
		current.itemCount += 1;
	}

	const machines: MachineAggregateSummary[] = [...machineSummary.entries()]
		.map(([machineProfileId, value]) => ({
			machineProfileId,
			...(value.machineLabel ? { machineLabel: value.machineLabel } : {}),
			verificationStatus: value.verificationStatus,
			runCount: machineRunSet.get(machineProfileId)?.size ?? 0,
			itemCount: value.itemCount,
		}))
		.sort((a, b) => a.machineProfileId.localeCompare(b.machineProfileId));

	const automatedScoreItems = items.filter(
		(item) => item.automatedScore !== undefined,
	).length;
	const frontierEvalItems = items.filter(
		(item) => item.frontierEval !== undefined,
	).length;

	return {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		checkpointId,
		summary: {
			runsConsidered: runs.length,
			runsMatched: matchedRuns.length,
			rawItems,
			dedupedItems: items.length,
			machines: machines.length,
			automatedScoreItems,
			frontierEvalItems,
		},
		machines,
		items,
	};
}

/**
 * Summarizes discovered checkpoints from a run set for index metadata.
 *
 * @param runs - Run inputs containing run and optional plan artifacts
 * @returns Checkpoint summaries sorted by latest run timestamp descending
 */
export function summarizeCheckpoints(runs: AggregateRunInput[]): CheckpointSummary[] {
	const grouped = new Map<
		string,
		{ runIds: Set<string>; machineIds: Set<string>; rawItemCount: number; latestRunAt: string }
	>();

	for (const input of runs) {
		const metadata = resolveRunMetadata(input);
		if (!metadata.checkpointId) continue;

		const machineProfileId = metadata.machineProfileId ?? `legacy-${input.run.runId}`;
		const group = grouped.get(metadata.checkpointId) ?? {
			runIds: new Set<string>(),
			machineIds: new Set<string>(),
			rawItemCount: 0,
			latestRunAt: "",
		};

		group.runIds.add(input.run.runId);
		group.machineIds.add(machineProfileId);
		group.rawItemCount += input.run.items.length;
		const candidateLatest = input.run.completedAt || input.run.startedAt;
		if (candidateLatest > group.latestRunAt) {
			group.latestRunAt = candidateLatest;
		}
		grouped.set(metadata.checkpointId, group);
	}

	return [...grouped.entries()]
		.map(([checkpointId, value]) => ({
			checkpointId,
			runCount: value.runIds.size,
			rawItemCount: value.rawItemCount,
			machineCount: value.machineIds.size,
			latestRunAt: value.latestRunAt,
		}))
		.sort((a, b) => b.latestRunAt.localeCompare(a.latestRunAt));
}
