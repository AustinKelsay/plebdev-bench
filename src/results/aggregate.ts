/**
 * Purpose: Aggregate benchmark items across runs for a specific checkpoint.
 * Exports: resolveRunMetadata, aggregateRunsForCheckpoint, summarizeCheckpoints
 *
 * Invariants:
 * - Aggregation key is machineProfileKey + runtime + canonical model identity + harness + test + passType
 * - Duplicate keys resolve to the strongest item first, then latest item on exact ties
 * - Outputs are deterministic
 */

import { migrateLegacyMachineProfile } from "../lib/machine-profile/legacy.js";
import type {
	MatrixItemResult,
	ModelProfileResolutionSource,
	RunPlan,
	RunResult,
	VerificationStatus,
} from "../schemas/index.js";
import {
	buildAggregateKey,
	compareAggregateCandidates,
	resolveItemTimestamp,
	resolveModelProfileResolutionSource,
	sortAggregatedItems,
} from "./aggregate-selection.js";

/** Run input bundle used by index/aggregate generation. */
export interface AggregateRunInput {
	run: RunResult;
	plan?: RunPlan;
}

/** Optional aggregate filters for derived analysis views. */
export interface AggregateRunsForCheckpointOptions {
	signalFilter?: "all" | "trusted_only";
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
	modelProfileResolutionSource: ModelProfileResolutionSource;
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
	signalFilter: {
		mode: "all" | "trusted_only";
		excludedTaintedItems: number;
	};
}

/** Leaderboard item-selection semantics for duplicate aggregate keys. */
export interface CheckpointAggregateSelectionPolicy {
	itemSelection: "best_observed_item";
	tieBreaker: "latest_item";
}

/** Full aggregate payload for one checkpoint. */
export interface CheckpointAggregate {
	schemaVersion: 2;
	generatedAt: string;
	checkpointId: string;
	selectionPolicy: CheckpointAggregateSelectionPolicy;
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

const VERIFICATION_STATUS_RANK: Record<VerificationStatus, number> = {
	verified: 0,
	self_reported: 1,
	rejected: 2,
};

/**
 * Combines two verification statuses conservatively.
 *
 * @param current - Existing aggregate status
 * @param next - New status to fold in
 * @returns Worst-case combined status
 */
function mergeVerificationStatus(
	current: VerificationStatus,
	next: VerificationStatus,
): VerificationStatus {
	return VERIFICATION_STATUS_RANK[next] > VERIFICATION_STATUS_RANK[current]
		? next
		: current;
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
	options: AggregateRunsForCheckpointOptions = {},
): CheckpointAggregate {
	const signalFilter = options.signalFilter ?? "all";
	const resolvedRuns = runs.map((input) => ({
		input,
		metadata: resolveRunMetadata(input),
	}));
	const deduped = new Map<
		string,
		{ timestamp: number; aggregated: AggregatedMatrixItem }
	>();
	const matchedRuns = resolvedRuns.filter(
		({ metadata }) => metadata.checkpointId === checkpointId,
	);

	let rawItems = 0;
	let excludedTaintedItems = 0;
	const profileRunSet = new Map<string, Set<string>>();
	const profileInstanceSet = new Map<string, Set<string>>();

	for (const { input, metadata } of matchedRuns) {
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
			if (
				signalFilter === "trusted_only" &&
				item.signalAssessment?.classification === "tainted"
			) {
				excludedTaintedItems++;
				continue;
			}
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
				modelProfileResolutionSource: resolveModelProfileResolutionSource(item),
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

	for (const { input, metadata } of matchedRuns) {
		const machineProfileKey = metadata.machineProfileKey ?? `legacy-${input.run.runId}`;
		const existing = machineSummary.get(machineProfileKey);
		if (existing) {
			existing.verificationStatus = mergeVerificationStatus(
				existing.verificationStatus,
				metadata.verificationStatus,
			);
			if (!existing.machineProfileLabel && metadata.machineProfileLabel) {
				existing.machineProfileLabel = metadata.machineProfileLabel;
			}
			continue;
		}
		machineSummary.set(machineProfileKey, {
			machineProfileLabel: metadata.machineProfileLabel,
			verificationStatus: metadata.verificationStatus,
			itemCount: 0,
		});
	}

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
		current.verificationStatus = mergeVerificationStatus(
			current.verificationStatus,
			item.verificationStatus,
		);
		if (!current.machineProfileLabel && item.machineProfileLabel) {
			current.machineProfileLabel = item.machineProfileLabel;
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
		selectionPolicy: {
			itemSelection: "best_observed_item",
			tieBreaker: "latest_item",
		},
		summary: {
			runsConsidered: runs.length,
			runsMatched: matchedRuns.length,
			rawItems,
			dedupedItems: items.length,
			machines: machines.length,
			instances: new Set(
				matchedRuns
					.map(({ metadata }) => metadata.machineInstanceId)
					.filter((value): value is string => Boolean(value)),
			).size,
			automatedScoreItems: items.filter((item) => item.automatedScore).length,
			frontierEvalItems: items.filter((item) => item.frontierEval).length,
			signalFilter: {
				mode: signalFilter,
				excludedTaintedItems,
			},
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
