/**
 * Purpose: React hook for fetching the list of all runs.
 * Exports: useRuns
 */
import { useState, useEffect } from "react";
import type { RunListItem } from "@/lib/types";
import { fetchRuns } from "@/lib/api";

export interface UseRunsResult {
  runs: RunListItem[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuns();
      // Sort by startedAt descending (newest first)
      const sorted = data.sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
      setRuns(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { runs, loading, error, refetch: fetchData };
}
