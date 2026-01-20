/**
 * Purpose: Compare page component for comparing two benchmark runs.
 * Provides run selectors and displays comparison results.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns } from "@/hooks/use-runs";
import { useCompare } from "@/hooks/use-compare";
import { RunSelector } from "./run-selector";
import { CompareSummaryCard } from "./compare-summary";
import { CompareTable, RegressionsTable, ImprovementsTable } from "./compare-table";
import { formatDate } from "@/lib/utils";

export function ComparePageContent() {
  const navigate = useNavigate();
  const { runA: urlRunA, runB: urlRunB } = useParams<{
    runA: string;
    runB: string;
  }>();

  const { runs, loading: runsLoading } = useRuns();
  const [selectedRunA, setSelectedRunA] = useState<string | undefined>(urlRunA);
  const [selectedRunB, setSelectedRunB] = useState<string | undefined>(urlRunB);

  const { comparison, loading: compareLoading, error } = useCompare(
    selectedRunA,
    selectedRunB
  );

  // Update URL when selections change
  useEffect(() => {
    if (selectedRunA && selectedRunB) {
      navigate(`/compare/${selectedRunA}/${selectedRunB}`, { replace: true });
    }
  }, [selectedRunA, selectedRunB, navigate]);

  // Set initial selections from URL
  useEffect(() => {
    if (urlRunA) setSelectedRunA(urlRunA);
    if (urlRunB) setSelectedRunB(urlRunB);
  }, [urlRunA, urlRunB]);

  return (
    <PageContainer>
      <PageHeader
        title="Compare Runs"
        description="Compare two benchmark runs to see deltas"
      />

      {/* Run Selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {runsLoading ? (
              <>
                <Skeleton className="h-10 w-full md:w-[300px]" />
                <Skeleton className="h-10 w-full md:w-[300px]" />
              </>
            ) : (
              <>
                <RunSelector
                  runs={runs}
                  value={selectedRunA}
                  onValueChange={setSelectedRunA}
                  label="Run A (Baseline)"
                  placeholder="Select baseline run"
                />
                <RunSelector
                  runs={runs}
                  value={selectedRunB}
                  onValueChange={setSelectedRunB}
                  label="Run B (Comparison)"
                  placeholder="Select comparison run"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {!selectedRunA || !selectedRunB ? (
        <div className="rounded border border-border bg-card p-8 text-center">
          <p className="text-foreground-muted">
            Select two runs to compare their results.
          </p>
        </div>
      ) : compareLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <div className="rounded border border-danger/20 bg-danger/10 p-4 text-danger">
          <p className="font-medium">Error comparing runs</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      ) : comparison ? (
        <div className="space-y-6">
          {/* Run Headers */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground-muted">
                  Run A (Baseline)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium truncate">{comparison.runA.runId}</p>
                <p className="text-sm text-foreground-faint">
                  {formatDate(comparison.runA.timestamp)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground-muted">
                  Run B (Comparison)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium truncate">{comparison.runB.runId}</p>
                <p className="text-sm text-foreground-faint">
                  {formatDate(comparison.runB.timestamp)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Summary Cards */}
          <CompareSummaryCard summary={comparison.summary} />

          {/* Detailed Tables */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detailed Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">All Items</TabsTrigger>
                  <TabsTrigger value="changes">Changes Only</TabsTrigger>
                  <TabsTrigger value="regressions">
                    Regressions ({comparison.summary.statusChanges.regressed})
                  </TabsTrigger>
                  <TabsTrigger value="improvements">
                    Improvements ({comparison.summary.statusChanges.improved})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="mt-4">
                  <CompareTable items={comparison.matched} />
                </TabsContent>
                <TabsContent value="changes" className="mt-4">
                  <CompareTable items={comparison.matched} showOnlyChanges />
                </TabsContent>
                <TabsContent value="regressions" className="mt-4">
                  <RegressionsTable items={comparison.matched} />
                </TabsContent>
                <TabsContent value="improvements" className="mt-4">
                  <ImprovementsTable items={comparison.matched} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageContainer>
  );
}
