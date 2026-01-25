/**
 * Purpose: React hook for fetching a single run's details.
 * Exports: useRunDetail
 */
import { useState, useEffect } from "react";
import type { RunResult, RunPlan } from "@/lib/types";
import { fetchRunWithPlan } from "@/lib/api";

export interface UseRunDetailResult {
  run: RunResult | null;
  plan: RunPlan | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches both run.json and plan.json for a single run.
 * @param runId - The run ID to fetch
 */
export function useRunDetail(runId: string | undefined): UseRunDetailResult {
  const [run, setRun] = useState<RunResult | null>(null);
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setPlan(null);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { run: runData, plan: planData } = await fetchRunWithPlan(runId);
        setRun(runData);
        setPlan(planData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch run");
        setRun(null);
        setPlan(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [runId]);

  return { run, plan, loading, error };
}
