/**
 * Purpose: Timing distribution histogram using Recharts.
 * Shows distribution of generation durations with p50/p90 markers.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface TimingDistributionProps {
  items: MatrixItemResult[];
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { range: string; count: number } }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
        <p className="font-medium">{data.range}</p>
        <p className="text-foreground-muted">{data.count} items</p>
      </div>
    );
  }
  return null;
}

/**
 * Creates histogram bins from duration data.
 */
function createHistogramBins(
  durations: number[],
  binCount = 10
): Array<{ range: string; count: number; min: number; max: number }> {
  if (durations.length === 0) return [];

  const sorted = [...durations].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const binSize = (max - min) / binCount || 1;

  const bins: Array<{ range: string; count: number; min: number; max: number }> = [];

  for (let i = 0; i < binCount; i++) {
    const binMin = min + i * binSize;
    const binMax = min + (i + 1) * binSize;
    const count = durations.filter((d) => d >= binMin && (i === binCount - 1 ? d <= binMax : d < binMax)).length;

    bins.push({
      range: `${formatDuration(binMin)} - ${formatDuration(binMax)}`,
      count,
      min: binMin,
      max: binMax,
    });
  }

  return bins;
}

/**
 * Calculates percentile value from sorted array.
 */
function percentile(sorted: number[], p: number): number {
  const index = Math.floor(sorted.length * p);
  return sorted[Math.min(index, sorted.length - 1)];
}

export function TimingDistribution({ items }: TimingDistributionProps) {
  const durations = items
    .map((item) => item.generation?.durationMs)
    .filter((d): d is number => d !== undefined);

  if (durations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timing Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground-faint text-sm py-8 text-center">
            No timing data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bins = createHistogramBins(durations, 8);
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);

  // Find bin indices for reference lines
  const p50BinIndex = bins.findIndex((b) => p50 >= b.min && p50 <= b.max);
  const p90BinIndex = bins.findIndex((b) => p90 >= b.min && p90 <= b.max);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timing Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4 text-sm">
          <div>
            <span className="text-foreground-muted">p50: </span>
            <span className="font-medium">{formatDuration(p50)}</span>
          </div>
          <div>
            <span className="text-foreground-muted">p90: </span>
            <span className="font-medium">{formatDuration(p90)}</span>
          </div>
          <div>
            <span className="text-foreground-muted">Items: </span>
            <span className="font-medium">{durations.length}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bins} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
            <XAxis
              dataKey="range"
              stroke="hsl(210, 12%, 63%)"
              tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              stroke="hsl(210, 12%, 63%)"
              tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="hsl(212, 100%, 67%)" radius={[4, 4, 0, 0]} />
            {p50BinIndex >= 0 && (
              <ReferenceLine
                x={bins[p50BinIndex].range}
                stroke="hsl(156, 67%, 55%)"
                strokeDasharray="5 5"
                label={{
                  value: "p50",
                  fill: "hsl(156, 67%, 55%)",
                  fontSize: 10,
                }}
              />
            )}
            {p90BinIndex >= 0 && (
              <ReferenceLine
                x={bins[p90BinIndex].range}
                stroke="hsl(43, 93%, 63%)"
                strokeDasharray="5 5"
                label={{
                  value: "p90",
                  fill: "hsl(43, 93%, 63%)",
                  fontSize: 10,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
