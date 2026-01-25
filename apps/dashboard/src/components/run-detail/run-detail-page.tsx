/**
 * Purpose: Run detail page component displaying a single run's results.
 * Shows summary, matrix table, scoring breakdown, and timing stats.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MatrixTable } from "./matrix-table";
import { ScoringBreakdown } from "./scoring-breakdown";
import { TimingStats } from "./timing-stats";
import { ItemDetailDialog } from "./item-detail-dialog";
import { PassRateChart } from "@/components/charts/pass-rate-chart";
import { TimingDistribution } from "@/components/charts/timing-distribution";
import { FrontierEvalScatter } from "@/components/charts/frontier-eval-scatter";
import type { RunResult, RunPlan, MatrixItemResult } from "@/lib/types";
import { computePassRate, computeFrontierStats } from "@/lib/aggregations";
import { formatDuration, formatDate, formatPercent } from "@/lib/utils";

interface RunDetailPageProps {
  run: RunResult;
  plan: RunPlan;
}

export function RunDetailPage({ run, plan }: RunDetailPageProps) {
  const [selectedItem, setSelectedItem] = useState<MatrixItemResult | null>(null);

  const passRate = computePassRate(run.items);
  const frontierStats = computeFrontierStats(run.items);

  return (
    <PageContainer>
      <PageHeader
        title={run.runId}
        description={`${formatDate(run.startedAt)} · ${formatDuration(run.durationMs)}`}
      >
        <Link to="/compare">
          <Button variant="outline" size="sm">
            Compare
          </Button>
        </Link>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground-muted">Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {run.summary.completed}
              <span className="text-foreground-faint">/{run.summary.total}</span>
            </div>
            {run.summary.failed > 0 && (
              <Badge variant="destructive" className="mt-1">
                {run.summary.failed} failed
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground-muted">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold tabular-nums ${
                passRate.passRate >= 0.8
                  ? "text-success"
                  : passRate.passRate >= 0.5
                    ? "text-warning"
                    : "text-danger"
              }`}
            >
              {formatPercent(passRate.passRate)}
            </div>
            <p className="text-sm text-foreground-faint">
              {passRate.passed}/{passRate.total} tests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground-muted">Frontier Eval</CardTitle>
          </CardHeader>
          <CardContent>
            {frontierStats ? (
              <>
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    frontierStats.avgScore >= 7
                      ? "text-success"
                      : frontierStats.avgScore >= 4
                        ? "text-warning"
                        : "text-danger"
                  }`}
                >
                  {frontierStats.avgScore.toFixed(1)}
                  <span className="text-foreground-faint">/10</span>
                </div>
                <p className="text-sm text-foreground-faint">
                  avg ({frontierStats.count} items)
                </p>
              </>
            ) : (
              <p className="text-foreground-faint">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground-muted">Environment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{plan.environment.platform}</p>
            <p className="text-sm text-foreground-faint">
              Bun {plan.environment.bunVersion}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Matrix Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <MatrixTable items={run.items} onRowClick={setSelectedItem} />
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-4 md:grid-cols-2">
        <ScoringBreakdown items={run.items} />
        <TimingStats items={run.items} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PassRateChart items={run.items} />
        <TimingDistribution items={run.items} />
      </div>

      <FrontierEvalScatter items={run.items} />

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        item={selectedItem}
        open={selectedItem !== null}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />
    </PageContainer>
  );
}

export function RunDetailPageSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </PageContainer>
  );
}
