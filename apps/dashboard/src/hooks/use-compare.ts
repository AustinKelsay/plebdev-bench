/**
 * Purpose: React hook for comparing two runs.
 * Exports: useCompare
 */
import { useState, useEffect } from "react";
import type { RunResult, CompareResult } from "@/lib/types";
import { fetchRun } from "@/lib/api";
import { compareRuns } from "@/lib/aggregations";

export interface UseCompareResult {
  comparison: CompareResult | null;
  runA: RunResult | null;
  runB: RunResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches two runs and computes their comparison.
 * @param runIdA - First run ID (baseline)
 * @param runIdB - Second run ID (comparison)
 */
export function useCompare(
  runIdA: string | undefined,
  runIdB: string | undefined
): UseCompareResult {
  const [comparison, setComparison] = useState<CompareResult | null>(null);
  const [runA, setRunA] = useState<RunResult | null>(null);
  const [runB, setRunB] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runIdA || !runIdB) {
      setComparison(null);
      setRunA(null);
      setRunB(null);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [runAData, runBData] = await Promise.all([
          fetchRun(runIdA),
          fetchRun(runIdB),
        ]);
        setRunA(runAData);
        setRunB(runBData);

        const result = compareRuns(
          { runId: runAData.runId, startedAt: runAData.startedAt, items: runAData.items },
          { runId: runBData.runId, startedAt: runBData.startedAt, items: runBData.items }
        );
        setComparison(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to compare runs");
        setComparison(null);
        setRunA(null);
        setRunB(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [runIdA, runIdB]);

  return { comparison, runA, runB, loading, error };
}
