/**
 * Purpose: Build checkpoint-oriented run groups for the runs page.
 * Exports: buildRunCheckpointGroups, RunCheckpointGroup
 *
 * Invariants:
 * - Checkpoint groups follow dashboard index checkpoint ordering (newest first)
 * - Latest checkpoint is marked distinctly for "live leaderboard" messaging
 * - Runs without checkpoint metadata are grouped into a legacy bucket
 */

import type { DashboardCheckpointSummary, RunListItem } from "@/lib/types";

export interface RunCheckpointGroup {
	key: string;
	title: string;
	checkpointId: string | null;
	seasonNumber: number | null;
	isLatest: boolean;
	isLegacy: boolean;
	runCount: number;
	machineCount: number;
	rawItemCount: number;
	latestRunAt: string;
	runs: RunListItem[];
}

/**
 * Groups published runs by checkpoint for the runs page.
 *
 * @param runs - Published run list items
 * @param checkpoints - Checkpoint summaries from dashboard index
 * @param latestCheckpointId - Checkpoint currently driving leaderboard/latest views
 * @returns Ordered checkpoint groups for rendering
 */
export function buildRunCheckpointGroups(
	runs: RunListItem[],
	checkpoints: DashboardCheckpointSummary[],
	latestCheckpointId: string | null,
): RunCheckpointGroup[] {
	const runsByCheckpoint = new Map<string, RunListItem[]>();
	const legacyRuns: RunListItem[] = [];

	for (const run of runs) {
		if (!run.checkpointId) {
			legacyRuns.push(run);
			continue;
		}
		const group = runsByCheckpoint.get(run.checkpointId) ?? [];
		group.push(run);
		runsByCheckpoint.set(run.checkpointId, group);
	}

	const checkpointGroups = checkpoints.map((checkpoint, index) => {
		const seasonNumber = checkpoints.length - index;
		return {
			key: checkpoint.checkpointId,
			title: `Checkpoint Season ${String(seasonNumber).padStart(2, "0")}`,
			checkpointId: checkpoint.checkpointId,
			seasonNumber,
			isLatest: checkpoint.checkpointId === latestCheckpointId,
			isLegacy: false,
			runCount: checkpoint.runCount,
			machineCount: checkpoint.machineCount,
			rawItemCount: checkpoint.rawItemCount,
			latestRunAt: checkpoint.latestRunAt,
			runs: runsByCheckpoint.get(checkpoint.checkpointId) ?? [],
		} satisfies RunCheckpointGroup;
	});

	if (legacyRuns.length === 0) {
		return checkpointGroups;
	}

	const latestRunAt =
		legacyRuns[0]?.completedAt ??
		legacyRuns[0]?.startedAt ??
		new Date(0).toISOString();
	const machineIds = new Set(
		legacyRuns
			.map((run) => run.machineProfileId)
			.filter((machineId): machineId is string => Boolean(machineId)),
	);

	return [
		...checkpointGroups,
		{
			key: "legacy",
			title: "Legacy / Unscoped Runs",
			checkpointId: null,
			seasonNumber: null,
			isLatest: false,
			isLegacy: true,
			runCount: legacyRuns.length,
			machineCount: machineIds.size,
			rawItemCount: legacyRuns.reduce(
				(total, run) => total + run.summary.total,
				0,
			),
			latestRunAt,
			runs: legacyRuns,
		},
	];
}
