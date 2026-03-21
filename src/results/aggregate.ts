/**
 * Purpose: Aggregate benchmark items across runs for a specific checkpoint.
 * Exports: resolveRunMetadata, aggregateRunsForCheckpoint, summarizeCheckpoints
 *
 * Invariants:
 * - Aggregation key is machineProfileKey + runtime + model + harness + test + passType
 * - Duplicate keys resolve to the strongest item first, then latest item on exact ties
 * - Outputs are deterministic
 */

import { migrateLegacyMachineProfile } from "../lib/machine-profile/legacy.js";
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

/** Resolved metadata used for checkpoint and profile-aware aggregation. */
export interface ResolvedRunMetadata {
	checkpointId?: string;
	machineProfileKey?: string;
	machineProfileLabel?: string;
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	verificationStatus: VerificationStatus;
	isLegacy: boolean;
}

/** Aggregated item with machine/run provenance fields. */
export type AggregatedMatrixItem = MatrixItemResult & {
	machineProfileKey: string;
	machineProfileId?: string;
	machineProfileLabel?: string;
	machineLabel?: string;
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	verificationStatus: VerificationStatus;
	sourceRunId: string;
	sourceCompletedAt: string;
};

/** Per-profile summary for a checkpoint aggregate. */
export interface MachineAggregateSummary {
	machineProfileKey: string;
	machineProfileId?: string;
	machineProfileLabel?: string;
	machineLabel?: string;
	verificationStatus: VerificationStatus;
	runCount: number;
	itemCount: number;
	instanceCount: number;
}

/** Aggregate summary counters for one checkpoint. */
export interface CheckpointAggregateSummary {
	runsConsidered: number;
	runsMatched: number;
	rawItems: number;
	dedupedItems: number;
	machines: number;
	instances: number;
	automatedScoreItems: number;
	frontierEvalItems: number;
}

/** Full aggregate payload for one checkpoint. */
export interface CheckpointAggregate {
	schemaVersion: 2;
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
	instanceCount: number;
	latestRunAt: string;
}

/**
 * Builds the deterministic aggregation key for one matrix item.
 *
 * @param machineProfileKey - Machine profile key
 * @param item - Matrix item
 * @returns Stable aggregation key
 */
function buildAggregateKey(
	machineProfileKey: string,
	item: MatrixItemResult,
): string {
	return `${machineProfileKey}|${item.runtime}|${item.model}|${item.harness}|${item.test}|${item.passType}`;
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
 * Compares two aggregate candidates for the same profile+matrix key.
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
	if (statusDelta !== 0) return statusDelta;

	const passRateDelta =
		getAutomatedPassRate(candidate.aggregated) -
		getAutomatedPassRate(incumbent.aggregated);
	if (passRateDelta !== 0) return passRateDelta;

	const passedDelta =
		(candidate.aggregated.automatedScore?.passed ?? -1) -
		(incumbent.aggregated.automatedScore?.passed ?? -1);
	if (passedDelta !== 0) return passedDelta;

	const totalDelta =
		(candidate.aggregated.automatedScore?.total ?? -1) -
		(incumbent.aggregated.automatedScore?.total ?? -1);
	if (totalDelta !== 0) return totalDelta;

	const frontierDelta =
		(candidate.aggregated.frontierEval?.score ?? -1) -
		(incumbent.aggregated.frontierEval?.score ?? -1);
	if (frontierDelta !== 0) return frontierDelta;

	const generationSuccessDelta =
		Number(candidate.aggregated.generation?.success === true) -
		Number(incumbent.aggregated.generation?.success === true);
	if (generationSuccessDelta !== 0) return generationSuccessDelta;

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
 * @param left - First aggregated item
 * @param right - Second aggregated item
 * @returns Sort comparator result
 */
function sortAggregatedItems(
	left: AggregatedMatrixItem,
	right: AggregatedMatrixItem,
): number {
	const leftKey = buildAggregateKey(left.machineProfileKey, left);
	const rightKey = buildAggregateKey(right.machineProfileKey, right);
	if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
	if (left.sourceCompletedAt !== right.sourceCompletedAt) {
		return left.sourceCompletedAt.localeCompare(right.sourceCompletedAt);
	}
	return left.sourceRunId.localeCompare(right.sourceRunId);
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
	const machine =
		migrateLegacyMachineProfile(run.machine) ??
		migrateLegacyMachineProfile(plan?.machine);
	const verificationStatus =
		run.provenance?.verificationStatus ??
		plan?.provenance?.verificationStatus ??
		"self_reported";
	const isLegacy = !checkpointId || !machine?.profileKey;

	return {
		checkpointId,
		machineProfileKey: machine?.profileKey,
		machineProfileLabel: machine?.profileLabel,
		machineInstanceId: machine?.instanceId,
		machineDisplayLabel: machine?.displayLabel,
		verificationStatus,
		isLegacy,
	};
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
	const matchedRuns = runs.filter(
		(input) => resolveRunMetadata(input).checkpointId === checkpointId,
	);

	let rawItems = 0;
	const profileRunSet = new Map<string, Set<string>>();
	const profileInstanceSet = new Map<string, Set<string>>();

	for (const input of matchedRuns) {
		const metadata = resolveRunMetadata(input);
		const machineProfileKey = metadata.machineProfileKey ?? `legacy-${input.run.runId}`;
		const runsForProfile = profileRunSet.get(machineProfileKey) ?? new Set<string>();
		runsForProfile.add(input.run.runId);
		profileRunSet.set(machineProfileKey, runsForProfile);
		if (metadata.machineInstanceId) {
			const instances = profileInstanceSet.get(machineProfileKey) ?? new Set<string>();
			instances.add(metadata.machineInstanceId);
			profileInstanceSet.set(machineProfileKey, instances);
		}

		for (const item of input.run.items) {
			rawItems++;
			const key = buildAggregateKey(machineProfileKey, item);
			const timestamp = resolveItemTimestamp(input.run, item);
				const aggregated: AggregatedMatrixItem = {
					...item,
					machineProfileKey,
					machineProfileId: machineProfileKey,
					...(metadata.machineProfileLabel
						? { machineProfileLabel: metadata.machineProfileLabel }
						: {}),
					...(metadata.machineDisplayLabel ?? metadata.machineProfileLabel
						? {
								machineLabel:
									metadata.machineDisplayLabel ?? metadata.machineProfileLabel,
							}
						: {}),
					...(metadata.machineInstanceId
						? { machineInstanceId: metadata.machineInstanceId }
						: {}),
				...(metadata.machineDisplayLabel
					? { machineDisplayLabel: metadata.machineDisplayLabel }
					: {}),
				verificationStatus: metadata.verificationStatus,
				sourceRunId: input.run.runId,
				sourceCompletedAt:
					item.completedAt ??
					item.startedAt ??
					input.run.completedAt ??
					input.run.startedAt ??
					"",
			};

			const previous = deduped.get(key);
			if (
				!previous ||
				compareAggregateCandidates({ timestamp, aggregated }, previous) > 0
			) {
				deduped.set(key, { timestamp, aggregated });
			}
		}
	}

	const items = [...deduped.values()]
		.map((entry) => entry.aggregated)
		.sort(sortAggregatedItems);
	const machineSummary = new Map<
		string,
		{ machineProfileLabel?: string; verificationStatus: VerificationStatus; itemCount: number }
	>();

	for (const item of items) {
		const current = machineSummary.get(item.machineProfileKey);
		if (!current) {
			machineSummary.set(item.machineProfileKey, {
				machineProfileLabel: item.machineProfileLabel,
				verificationStatus: item.verificationStatus,
				itemCount: 1,
			});
			continue;
		}
		current.itemCount += 1;
	}

	const machines: MachineAggregateSummary[] = [...machineSummary.entries()]
			.map(([machineProfileKey, value]) => ({
				machineProfileKey,
				machineProfileId: machineProfileKey,
				...(value.machineProfileLabel
					? { machineProfileLabel: value.machineProfileLabel }
					: {}),
				...(value.machineProfileLabel
					? { machineLabel: value.machineProfileLabel }
					: {}),
				verificationStatus: value.verificationStatus,
				runCount: profileRunSet.get(machineProfileKey)?.size ?? 0,
				itemCount: value.itemCount,
			instanceCount: profileInstanceSet.get(machineProfileKey)?.size ?? 0,
		}))
		.sort((left, right) =>
			left.machineProfileKey.localeCompare(right.machineProfileKey),
		);

	return {
		schemaVersion: 2,
		generatedAt: new Date().toISOString(),
		checkpointId,
		summary: {
			runsConsidered: runs.length,
			runsMatched: matchedRuns.length,
			rawItems,
			dedupedItems: items.length,
			machines: machines.length,
			instances: new Set(
				matchedRuns
					.map((input) => resolveRunMetadata(input).machineInstanceId)
					.filter((value): value is string => Boolean(value)),
			).size,
			automatedScoreItems: items.filter((item) => item.automatedScore).length,
			frontierEvalItems: items.filter((item) => item.frontierEval).length,
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
		{
			runIds: Set<string>;
			profileKeys: Set<string>;
			instanceIds: Set<string>;
			rawItemCount: number;
			latestRunAt: string;
		}
	>();

	for (const input of runs) {
		const metadata = resolveRunMetadata(input);
		if (!metadata.checkpointId) continue;
		const profileKey = metadata.machineProfileKey ?? `legacy-${input.run.runId}`;
		const group = grouped.get(metadata.checkpointId) ?? {
			runIds: new Set<string>(),
			profileKeys: new Set<string>(),
			instanceIds: new Set<string>(),
			rawItemCount: 0,
			latestRunAt: "",
		};

		group.runIds.add(input.run.runId);
		group.profileKeys.add(profileKey);
		if (metadata.machineInstanceId) {
			group.instanceIds.add(metadata.machineInstanceId);
		}
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
			machineCount: value.profileKeys.size,
			instanceCount: value.instanceIds.size,
			latestRunAt: value.latestRunAt,
		}))
		.sort((left, right) => right.latestRunAt.localeCompare(left.latestRunAt));
}
