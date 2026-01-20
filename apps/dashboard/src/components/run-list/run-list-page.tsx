/**
 * Purpose: Run list page component displaying all benchmark runs.
 * Shows a grid of RunCard components sorted by date (newest first).
 */
import { useRuns } from "@/hooks/use-runs";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { RunCard } from "./run-card";
import { Skeleton } from "@/components/ui/skeleton";

export function RunListPage() {
  const { runs, loading, error } = useRuns();

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Benchmark Runs" />
        <div className="rounded border border-danger/20 bg-danger/10 p-4 text-danger">
          <p className="font-medium">Error loading runs</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Benchmark Runs"
        description={loading ? "Loading..." : `${runs.length} runs`}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded border border-border bg-card p-8 text-center">
          <p className="text-foreground-muted">No benchmark runs found.</p>
          <p className="mt-2 text-sm text-foreground-faint">
            Run <code className="bg-muted px-1.5 py-0.5 rounded">bun pb</code> to
            create your first benchmark, then{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">
              bun dashboard:index
            </code>{" "}
            to generate the runs index.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run) => (
            <RunCard key={run.runId} run={run} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
