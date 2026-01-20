/**
 * Purpose: Scoring breakdown component showing pass rates by dimension.
 * Displays grouped statistics by model, harness, or test.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixItemResult } from "@/lib/types";
import {
  computeBreakdown,
  groupByModel,
  groupByHarness,
  groupByTest,
  type DimensionBreakdown,
} from "@/lib/aggregations";
import { formatPercent } from "@/lib/utils";

interface ScoringBreakdownProps {
  items: MatrixItemResult[];
}

function BreakdownList({ breakdowns }: { breakdowns: DimensionBreakdown[] }) {
  if (breakdowns.length === 0) {
    return (
      <p className="text-foreground-faint text-sm">No scoring data available.</p>
    );
  }

  return (
    <div className="space-y-2">
      {breakdowns.map((b) => (
        <div key={b.name} className="flex items-center justify-between">
          <span className="text-sm truncate max-w-[200px]" title={b.name}>
            {b.name}
          </span>
          <span className="flex items-center gap-2 tabular-nums">
            <span
              className={
                b.passRate >= 0.8
                  ? "text-success"
                  : b.passRate >= 0.5
                    ? "text-warning"
                    : "text-danger"
              }
            >
              {formatPercent(b.passRate)}
            </span>
            <span className="text-foreground-faint text-sm">
              ({b.passed}/{b.total})
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoringBreakdown({ items }: ScoringBreakdownProps) {
  const byModel = computeBreakdown(items, groupByModel);
  const byHarness = computeBreakdown(items, groupByHarness);
  const byTest = computeBreakdown(items, groupByTest);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scoring Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="model">
          <TabsList>
            <TabsTrigger value="model">By Model</TabsTrigger>
            <TabsTrigger value="harness">By Harness</TabsTrigger>
            <TabsTrigger value="test">By Test</TabsTrigger>
          </TabsList>
          <TabsContent value="model" className="mt-4">
            <BreakdownList breakdowns={byModel} />
          </TabsContent>
          <TabsContent value="harness" className="mt-4">
            <BreakdownList breakdowns={byHarness} />
          </TabsContent>
          <TabsContent value="test" className="mt-4">
            <BreakdownList breakdowns={byTest} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
