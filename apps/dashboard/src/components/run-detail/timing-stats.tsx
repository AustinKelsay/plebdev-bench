/**
 * Purpose: Timing statistics component showing generation duration metrics.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixItemResult } from "@/lib/types";
import { computeTimingStats } from "@/lib/aggregations";
import { formatDuration } from "@/lib/utils";

interface TimingStatsProps {
  items: MatrixItemResult[];
}

export function TimingStats({ items }: TimingStatsProps) {
  const stats = computeTimingStats(items);

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground-faint text-sm">No timing data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timing</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-foreground-muted">Average</span>
            <p className="text-lg font-medium tabular-nums">
              {formatDuration(stats.mean)}
            </p>
          </div>
          <div>
            <span className="text-foreground-muted">Median</span>
            <p className="text-lg font-medium tabular-nums">
              {formatDuration(stats.median)}
            </p>
          </div>
          <div>
            <span className="text-foreground-muted">Min</span>
            <p className="tabular-nums">{formatDuration(stats.min)}</p>
          </div>
          <div>
            <span className="text-foreground-muted">Max</span>
            <p className="tabular-nums">{formatDuration(stats.max)}</p>
          </div>
          <div>
            <span className="text-foreground-muted">p90</span>
            <p className="tabular-nums">{formatDuration(stats.p90)}</p>
          </div>
          <div>
            <span className="text-foreground-muted">Items</span>
            <p className="tabular-nums">{stats.count}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
