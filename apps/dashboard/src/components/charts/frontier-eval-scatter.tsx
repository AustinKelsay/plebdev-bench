/**
 * Purpose: Frontier eval scatter plot using Recharts.
 * Shows relationship between automated pass rate and frontier eval score.
 */
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatrixItemResult } from "@/lib/types";
import { computeItemPassRate } from "@/lib/aggregations";

interface FrontierEvalScatterProps {
  items: MatrixItemResult[];
}

// Colors for different harnesses
const HARNESS_COLORS: Record<string, string> = {
  ollama: "hsl(212, 100%, 67%)", // info blue
  goose: "hsl(156, 67%, 55%)", // success green
  opencode: "hsl(43, 93%, 63%)", // warning yellow
};

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      model: string;
      harness: string;
      test: string;
      passRate: number;
      score: number;
    };
  }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
        <p className="font-medium">{data.model}</p>
        <p className="text-foreground-muted text-xs">
          {data.harness} / {data.test}
        </p>
        <p className="text-foreground-muted mt-1">
          Pass rate: {(data.passRate * 100).toFixed(1)}%
        </p>
        <p className="text-foreground-muted">Frontier: {data.score}/10</p>
      </div>
    );
  }
  return null;
}

export function FrontierEvalScatter({ items }: FrontierEvalScatterProps) {
  // Filter items that have both automated score and frontier eval
  const dataPoints = items
    .filter((item) => item.automatedScore && item.frontierEval)
    .map((item) => ({
      passRate: computeItemPassRate(item.automatedScore!),
      score: item.frontierEval!.score,
      model: item.model,
      harness: item.harness,
      test: item.test,
    }));

  if (dataPoints.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frontier Eval vs Pass Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground-faint text-sm py-8 text-center">
            No items with both automated score and frontier eval.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by harness for coloring
  const harnesses = [...new Set(dataPoints.map((d) => d.harness))];
  const dataByHarness = harnesses.map((harness) => ({
    harness,
    data: dataPoints.filter((d) => d.harness === harness),
    color: HARNESS_COLORS[harness] || "hsl(210, 12%, 63%)",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Frontier Eval vs Pass Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex gap-4 mb-4 text-sm">
          {dataByHarness.map(({ harness, color }) => (
            <div key={harness} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-foreground-muted">{harness}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
            <XAxis
              type="number"
              dataKey="passRate"
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              name="Pass Rate"
              stroke="hsl(210, 12%, 63%)"
              tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
              label={{
                value: "Automated Pass Rate",
                position: "bottom",
                fill: "hsl(210, 12%, 63%)",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="score"
              domain={[0, 10]}
              name="Frontier Score"
              stroke="hsl(210, 12%, 63%)"
              tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
              label={{
                value: "Frontier Score",
                angle: -90,
                position: "insideLeft",
                fill: "hsl(210, 12%, 63%)",
                fontSize: 12,
              }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<CustomTooltip />} />
            {dataByHarness.map(({ harness, data, color }) => (
              <Scatter
                key={harness}
                name={harness}
                data={data}
                fill={color}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>

        {/* Correlation note */}
        <p className="text-xs text-foreground-faint mt-2 text-center">
          Points show correlation between automated test pass rate and frontier
          model evaluation score.
        </p>
      </CardContent>
    </Card>
  );
}
