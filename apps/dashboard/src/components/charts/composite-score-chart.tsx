/**
 * Purpose: Composite score bar chart showing pass rate, tool success, and frontier score.
 * Replaces simple pass rate chart with multi-metric grouped bars.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import type { MatrixItemResult } from "@/lib/types";
import { composite as compositeTooltips } from "@/lib/tooltip-content";
import {
  computeCompositeMetrics,
  groupByModel,
  groupByRuntime,
  groupByHarness,
  groupByTest,
  inferToolHarnesses,
  type CompositeMetrics,
} from "@/lib/aggregations";

interface CompositeScoreChartProps {
  items: MatrixItemResult[];
  onDimensionClick?: (
    dimension: "model" | "runtime" | "harness" | "test",
    name: string
  ) => void;
}

// Chart colors - match existing design system
const COLORS = {
  effectiveScore: "hsl(45, 90%, 55%)", // gold/amber for primary ranking metric
  passRate: "hsl(156, 67%, 55%)", // success green
  toolSuccess: "hsl(210, 85%, 60%)", // blue
  frontier: "hsl(270, 60%, 60%)", // purple
};

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: CompositeMetrics;
  }>;
  label?: string;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
        <p className="font-medium mb-1">{label}</p>
        <p className="text-amber-400 font-semibold">
          Effective: {(data.effectiveScore * 100).toFixed(1)}%
        </p>
        <p className="text-foreground-muted text-xs mb-1">
          Completion: {data.completedItems}/{data.totalItems} items ({(data.completionRate * 100).toFixed(0)}%)
        </p>
        <p className="text-success">
          Pass: {(data.passRate * 100).toFixed(1)}% ({data.passed}/{data.total} tests)
        </p>
        {data.toolTotal > 0 && (
          <p className="text-blue-400">
            Tool: {(data.toolSuccessRate * 100).toFixed(1)}% ({data.toolTotal} items)
          </p>
        )}
        {data.frontierAvg !== null && (
          <p className="text-purple-400">
            Frontier: {data.frontierAvg.toFixed(1)}/10 ({data.frontierCount} evals)
          </p>
        )}
      </div>
    );
  }
  return null;
}

interface ChartData {
  name: string;
  effectiveScore: number;
  passRate: number;
  toolSuccess: number | null;
  frontier: number | null;
  // Keep raw data for tooltip
  raw: CompositeMetrics;
}

function prepareChartData(metrics: CompositeMetrics[]): ChartData[] {
  return metrics.map((m) => ({
    name: m.name.length > 20 ? m.name.slice(0, 18) + "..." : m.name,
    effectiveScore: m.effectiveScore * 100, // Primary ranking metric
    passRate: m.passRate * 100, // Convert to percentage
    toolSuccess: m.toolTotal > 0 ? m.toolSuccessRate * 100 : null,
    frontier: m.frontierAvg !== null ? (m.frontierAvg / 10) * 100 : null, // Normalize to 100 scale
    raw: m,
  }));
}

/** Custom Y-axis tick that's clickable */
function ClickableYAxisTick({
  x,
  y,
  payload,
  onClick,
}: {
  x: number;
  y: number;
  payload: { value: string };
  onClick?: (name: string) => void;
}) {
  const handleClick = () => {
    if (onClick) {
      onClick(payload.value);
    }
  };

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={handleClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <text
        x={-5}
        y={0}
        dy={4}
        textAnchor="end"
        fill="hsl(210, 30%, 92%)"
        fontSize={12}
        className={onClick ? "hover:fill-amber-400 transition-colors" : ""}
      >
        {payload.value}
      </text>
    </g>
  );
}

/** Creates a custom background component for bar rows - provides full-width clickable area */
function createRowBackground(onRowClick?: (name: string) => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function RowBackground(props: any) {
    const { x, y, width, height, payload } = props;

    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="hsl(210, 30%, 92%)"
        fillOpacity={0}
        onClick={() => payload?.raw?.name && onRowClick?.(payload.raw.name)}
        style={{ cursor: onRowClick ? "pointer" : "default" }}
        className="hover:fill-opacity-5 transition-all"
      />
    );
  };
}

function CompositeBarChart({
  data,
  onBarClick,
}: {
  data: ChartData[];
  onBarClick?: (name: string) => void;
}) {
  if (data.length === 0) {
    return (
      <p className="text-foreground-faint text-sm py-8 text-center">
        No scoring data available.
      </p>
    );
  }

  const hasToolData = data.some((d) => d.toolSuccess !== null);
  const hasFrontierData = data.some((d) => d.frontier !== null);

  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 50)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        barCategoryGap="20%"
        onClick={(state) => {
          if (onBarClick && state?.activePayload?.[0]?.payload) {
            const payload = state.activePayload[0].payload as ChartData;
            onBarClick(payload.raw.name);
          }
        }}
        style={{ cursor: onBarClick ? "pointer" : undefined }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke="hsl(210, 12%, 63%)"
          tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          stroke="hsl(210, 12%, 63%)"
          tick={(props) => (
            <ClickableYAxisTick
              {...props}
              onClick={onBarClick ? (name) => {
                // Find the raw name from the data
                const item = data.find((d) => d.name === name);
                if (item) onBarClick(item.raw.name);
              } : undefined}
            />
          )}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <CustomTooltip
              active={active}
              payload={payload?.map((p) => ({
                ...p,
                payload: (p.payload as ChartData).raw,
              })) as typeof payload extends undefined ? undefined : Array<{
                name: string;
                value: number;
                color: string;
                payload: CompositeMetrics;
              }>}
              label={label}
            />
          )}
        />
        <Legend
          wrapperStyle={{ paddingTop: "10px" }}
          formatter={(value) => (
            <span className="text-foreground-muted text-xs">{value}</span>
          )}
        />
        <Bar
          dataKey="effectiveScore"
          name="Effective Score"
          fill={COLORS.effectiveScore}
          radius={[0, 4, 4, 0]}
          onClick={(entry) => onBarClick?.(entry.raw.name)}
          cursor={onBarClick ? "pointer" : undefined}
          background={onBarClick ? createRowBackground(onBarClick) : undefined}
        />
        <Bar
          dataKey="passRate"
          name="Pass Rate"
          fill={COLORS.passRate}
          radius={[0, 4, 4, 0]}
          onClick={(entry) => onBarClick?.(entry.raw.name)}
          cursor={onBarClick ? "pointer" : undefined}
        />
        {hasToolData && (
          <Bar
            dataKey="toolSuccess"
            name="Tool Success"
            fill={COLORS.toolSuccess}
            radius={[0, 4, 4, 0]}
            onClick={(entry) => onBarClick?.(entry.raw.name)}
            cursor={onBarClick ? "pointer" : undefined}
          />
        )}
        {hasFrontierData && (
          <Bar
            dataKey="frontier"
            name="Frontier (scaled)"
            fill={COLORS.frontier}
            radius={[0, 4, 4, 0]}
            onClick={(entry) => onBarClick?.(entry.raw.name)}
            cursor={onBarClick ? "pointer" : undefined}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CompositeScoreChart({ items, onDimensionClick }: CompositeScoreChartProps) {
  const toolHarnesses = inferToolHarnesses(items);

  const byModel = computeCompositeMetrics(items, groupByModel, toolHarnesses);
  const byRuntime = computeCompositeMetrics(items, groupByRuntime, toolHarnesses);
  const byHarness = computeCompositeMetrics(items, groupByHarness, toolHarnesses);
  const byTest = computeCompositeMetrics(items, groupByTest, toolHarnesses);

  const modelData = prepareChartData(byModel);
  const runtimeData = prepareChartData(byRuntime);
  const harnessData = prepareChartData(byHarness);
  const testData = prepareChartData(byTest);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <WithInfoTooltip tooltip={compositeTooltips.title}>Composite Scores</WithInfoTooltip>
        </CardTitle>
        <p className="text-xs text-foreground-muted">
          <WithInfoTooltip tooltip={compositeTooltips.description} side="right">
            Effective score (gold) = 40% pass rate + 30% completion + 30% tool success.
          </WithInfoTooltip>
          {" "}Sorted by effective score to rank comprehensive performers higher.
          {onDimensionClick && " Click any row for details."}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="model">
          <TabsList>
            <TabsTrigger value="model">By Model</TabsTrigger>
            <TabsTrigger value="runtime">By Runtime</TabsTrigger>
            <TabsTrigger value="harness">By Harness</TabsTrigger>
            <TabsTrigger value="test">By Test</TabsTrigger>
          </TabsList>
          <TabsContent value="model" className="mt-4">
            <CompositeBarChart
              data={modelData}
              onBarClick={onDimensionClick ? (name) => onDimensionClick("model", name) : undefined}
            />
          </TabsContent>
          <TabsContent value="runtime" className="mt-4">
            <CompositeBarChart
              data={runtimeData}
              onBarClick={onDimensionClick ? (name) => onDimensionClick("runtime", name) : undefined}
            />
          </TabsContent>
          <TabsContent value="harness" className="mt-4">
            <CompositeBarChart
              data={harnessData}
              onBarClick={onDimensionClick ? (name) => onDimensionClick("harness", name) : undefined}
            />
          </TabsContent>
          <TabsContent value="test" className="mt-4">
            <CompositeBarChart
              data={testData}
              onBarClick={onDimensionClick ? (name) => onDimensionClick("test", name) : undefined}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
