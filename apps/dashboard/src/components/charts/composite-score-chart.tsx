/**
 * Purpose: Composite score bar chart showing pass rate, tool success, and frontier score.
 * Enhanced with gradient fills, median reference line, and shared primitives.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type CompositeMetrics,
	computeCompositeMetrics,
	groupByHarness,
	groupByModel,
	groupByRuntime,
	groupByTest,
	inferToolHarnesses,
} from "@/lib/aggregations";
import { CHART_COLORS } from "@/lib/chart-colors";
import { composite as compositeTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import {
	ClickableYAxisTick,
	createRowBackground,
} from "./chart-primitives";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface CompositeScoreChartProps {
	items: MatrixItemResult[];
	onDimensionClick?: (
		dimension: "model" | "runtime" | "harness" | "test",
		name: string,
	) => void;
}

const COLORS = {
	effectiveScore: CHART_COLORS.effectiveScore,
	passRate: CHART_COLORS.passRate,
	toolSuccess: CHART_COLORS.toolSuccess,
	frontier: CHART_COLORS.frontier,
};

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
				<p className="font-semibold text-success">
					Effective: {(data.effectiveScore * 100).toFixed(1)}%
				</p>
				<p className="text-foreground-muted text-xs mb-1">
					Completion: {data.completedItems}/{data.totalItems} items (
					{(data.completionRate * 100).toFixed(0)}%)
				</p>
				<p className="text-success">
					Pass: {(data.passRate * 100).toFixed(1)}% ({data.passed}/{data.total}{" "}
					tests)
				</p>
				{data.toolTotal > 0 && (
					<p className="text-info">
						Tool: {(data.toolSuccessRate * 100).toFixed(1)}% ({data.toolTotal}{" "}
						items)
					</p>
				)}
				{data.frontierAvg !== null && (
					<p style={{ color: CHART_COLORS.frontier }}>
						Frontier: {data.frontierAvg.toFixed(1)}/10 ({data.frontierCount}{" "}
						evals)
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
	raw: CompositeMetrics;
}

function prepareChartData(metrics: CompositeMetrics[]): ChartData[] {
	return metrics.map((m) => ({
		name: m.name.length > 20 ? `${m.name.slice(0, 18)}...` : m.name,
		effectiveScore: m.effectiveScore * 100,
		passRate: m.passRate * 100,
		toolSuccess: m.toolTotal > 0 ? m.toolSuccessRate * 100 : null,
		frontier: m.frontierAvg !== null ? (m.frontierAvg / 10) * 100 : null,
		raw: m,
	}));
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

	// Compute median effective score for reference line
	const scores = data.map((d) => d.effectiveScore).sort((a, b) => a - b);
	const median =
		scores.length % 2 === 0
			? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
			: scores[Math.floor(scores.length / 2)];

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
				<defs>
					<linearGradient id="effectiveGradient" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stopColor="hsl(142, 60%, 40%)" />
						<stop offset="100%" stopColor="hsl(142, 60%, 55%)" />
					</linearGradient>
				</defs>
				<CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
				<XAxis
					type="number"
					domain={[0, 100]}
					tickFormatter={(v) => `${v}%`}
					stroke={CHART_COLORS.text}
					tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
				/>
				<YAxis
					type="category"
					dataKey="name"
					width={90}
					stroke={CHART_COLORS.text}
					tick={(props) => (
						<ClickableYAxisTick
							{...props}
							onClick={
								onBarClick
									? (name) => {
											const item = data.find((d) => d.name === name);
											if (item) onBarClick(item.raw.name);
										}
									: undefined
							}
						/>
					)}
				/>
				<Tooltip
					content={({ active, payload, label }) => (
						<CustomTooltip
							active={active}
							payload={
								payload?.map((p) => ({
									...p,
									payload: (p.payload as ChartData).raw,
								})) as typeof payload extends undefined
									? undefined
									: Array<{
											name: string;
											value: number;
											color: string;
											payload: CompositeMetrics;
										}>
							}
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
				<ReferenceLine
					x={median}
					stroke="hsl(210, 12%, 50%)"
					strokeDasharray="4 4"
					label={{
						value: `median ${median.toFixed(0)}%`,
						fill: "hsl(210, 12%, 50%)",
						fontSize: 10,
						position: "top",
					}}
				/>
				<Bar
					dataKey="effectiveScore"
					name="Effective Score"
					fill="url(#effectiveGradient)"
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

export function CompositeScoreChart({
	items,
	onDimensionClick,
}: CompositeScoreChartProps) {
	const toolHarnesses = inferToolHarnesses(items);

	const byModel = computeCompositeMetrics(items, groupByModel, toolHarnesses);
	const byRuntime = computeCompositeMetrics(
		items,
		groupByRuntime,
		toolHarnesses,
	);
	const byHarness = computeCompositeMetrics(
		items,
		groupByHarness,
		toolHarnesses,
	);
	const byTest = computeCompositeMetrics(items, groupByTest, toolHarnesses);

	const modelData = prepareChartData(byModel);
	const runtimeData = prepareChartData(byRuntime);
	const harnessData = prepareChartData(byHarness);
	const testData = prepareChartData(byTest);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={compositeTooltips.title}>
						Composite Scores
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip tooltip={compositeTooltips.description} side="right">
						Effective score (green) = 40% pass rate + 30% completion + 30% tool
						success.
					</WithInfoTooltip>{" "}
					Sorted by effective score to rank comprehensive performers higher.
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
							onBarClick={
								onDimensionClick
									? (name) => onDimensionClick("model", name)
									: undefined
							}
						/>
					</TabsContent>
					<TabsContent value="runtime" className="mt-4">
						<CompositeBarChart
							data={runtimeData}
							onBarClick={
								onDimensionClick
									? (name) => onDimensionClick("runtime", name)
									: undefined
							}
						/>
					</TabsContent>
					<TabsContent value="harness" className="mt-4">
						<CompositeBarChart
							data={harnessData}
							onBarClick={
								onDimensionClick
									? (name) => onDimensionClick("harness", name)
									: undefined
							}
						/>
					</TabsContent>
					<TabsContent value="test" className="mt-4">
						<CompositeBarChart
							data={testData}
							onBarClick={
								onDimensionClick
									? (name) => onDimensionClick("test", name)
									: undefined
							}
						/>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
