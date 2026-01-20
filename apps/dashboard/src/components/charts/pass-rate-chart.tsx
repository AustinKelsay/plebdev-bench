/**
 * Purpose: Pass rate bar chart component using Recharts.
 * Shows pass rate by model, harness, or test dimension.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MatrixItemResult } from "@/lib/types";
import {
  computeBreakdown,
  groupByModel,
  groupByHarness,
  groupByTest,
} from "@/lib/aggregations";

interface PassRateChartProps {
  items: MatrixItemResult[];
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; passRate: number; passed: number; total: number } }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
        <p className="font-medium">{data.name}</p>
        <p className="text-foreground-muted">
          {(data.passRate * 100).toFixed(1)}% ({data.passed}/{data.total})
        </p>
      </div>
    );
  }
  return null;
}

// Get bar color based on pass rate
function getBarColor(passRate: number): string {
  if (passRate >= 0.8) return "hsl(156, 67%, 55%)"; // success
  if (passRate >= 0.5) return "hsl(43, 93%, 63%)"; // warning
  return "hsl(0, 100%, 68%)"; // danger
}

function PassRateBarChart({
  data,
}: {
  data: Array<{ name: string; passRate: number; passed: number; total: number }>;
}) {
  if (data.length === 0) {
    return (
      <p className="text-foreground-faint text-sm py-8 text-center">
        No scoring data available.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          stroke="hsl(210, 12%, 63%)"
          tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          stroke="hsl(210, 12%, 63%)"
          tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="passRate" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.passRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PassRateChart({ items }: PassRateChartProps) {
  const byModel = computeBreakdown(items, groupByModel);
  const byHarness = computeBreakdown(items, groupByHarness);
  const byTest = computeBreakdown(items, groupByTest);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pass Rate</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="model">
          <TabsList>
            <TabsTrigger value="model">By Model</TabsTrigger>
            <TabsTrigger value="harness">By Harness</TabsTrigger>
            <TabsTrigger value="test">By Test</TabsTrigger>
          </TabsList>
          <TabsContent value="model" className="mt-4">
            <PassRateBarChart data={byModel} />
          </TabsContent>
          <TabsContent value="harness" className="mt-4">
            <PassRateBarChart data={byHarness} />
          </TabsContent>
          <TabsContent value="test" className="mt-4">
            <PassRateBarChart data={byTest} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
