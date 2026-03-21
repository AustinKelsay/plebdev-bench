/**
 * Purpose: React hook for fetching the list of all runs.
 * Exports: useRuns
 */
import { fetchDashboardIndex } from "@/lib/api";
import type { DashboardCheckpointSummary, RunListItem } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export interface UseRunsResult {
	runs: RunListItem[];
	checkpoints: DashboardCheckpointSummary[];
	latestCheckpointId: string | null;
	loading: boolean;
	error: string | null;
	refetch: () => void;
}

/**
 * Fetches the list of all available benchmark runs.
 * Returns runs sorted by startedAt descending (newest first).
 */
export function useRuns(): UseRunsResult {
	const [runs, setRuns] = useState<RunListItem[]>([]);
	const [checkpoints, setCheckpoints] = useState<DashboardCheckpointSummary[]>(
		[],
	);
	const [latestCheckpointId, setLatestCheckpointId] = useState<string | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const index = await fetchDashboardIndex();
			// Sort by startedAt descending (newest first)
			const sortedRuns = [...index.runs].sort(
				(a, b) =>
					new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
			);
			setRuns(sortedRuns);
			setCheckpoints(index.checkpoints);
			setLatestCheckpointId(index.latestCheckpointId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch runs");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchData();
	}, [fetchData]);

	return {
		runs,
		checkpoints,
		latestCheckpointId,
		loading,
		error,
		refetch: fetchData,
	};
}
