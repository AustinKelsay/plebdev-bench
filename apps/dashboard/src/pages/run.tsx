/**
 * Purpose: Single run page route component.
 * Displays run details by runId from URL params.
 */
import { useParams } from "react-router-dom";
import { useRunDetail } from "@/hooks/use-run-detail";
import { RunDetailPage, RunDetailPageSkeleton } from "@/components/run-detail/run-detail-page";
import { PageContainer, PageHeader } from "@/components/layout/page-container";

export function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, plan, loading, error } = useRunDetail(runId);

  if (loading) {
    return <RunDetailPageSkeleton />;
  }

  if (error || !run || !plan) {
    return (
      <PageContainer>
        <PageHeader title="Run Not Found" />
        <div className="rounded border border-danger/20 bg-danger/10 p-4 text-danger">
          <p className="font-medium">Error loading run</p>
          <p className="text-sm opacity-80">{error || "Run data not found"}</p>
        </div>
      </PageContainer>
    );
  }

  return <RunDetailPage run={run} plan={plan} />;
}
