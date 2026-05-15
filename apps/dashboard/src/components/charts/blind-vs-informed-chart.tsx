/**
 * Purpose: Blind vs informed prompt comparison chart.
 * Exports: BlindVsInformedChart
 *
 * Invariants:
 * - Shows paired bars comparing blind and informed pass rates.
 * - Provides model and harness breakdown tabs over the same item set.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type BlindInformedBreakdown,
	computeBlindInformedBreakdown,
	groupByHarness,
	groupByModel,
} from "@/lib/aggregations";
import { blindInformed as blindInformedTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
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

interface BlindVsInformedChartProps {
	items: MatrixItemResult[];
}

// Chart colors — toned for dark background consistency
const COLORS = {
	blind: "hsl(38, 80%, 58%)", // warm amber for blind
	informed: "hsl(142, 60%, 49%)", // brand green for informed
	deltaPositive: "hsl(142, 60%, 49%)",
	deltaNegative: "hsl(0, 70%, 60%)",
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
		payload: BlindInformedBreakdown;
	}>;
	label?: string;
}) {
	if (active && payload && payload.length) {
		const data = payload[0].payload;
		const deltaSign = data.delta >= 0 ? "+" : "";
		const deltaColor = data.delta >= 0 ? "text-success" : "text-danger";

		return (
			<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
				<p className="font-medium mb-1">{label}</p>
				<p className="text-warning">
					Blind: {(data.blindPassRate * 100).toFixed(1)}% ({data.blindPassed}/
					{data.blindTotal})
				</p>
				<p className="text-success">
					Informed: {(data.informedPassRate * 100).toFixed(1)}% (
					{data.informedPassed}/{data.informedTotal})
				</p>
				<p className={deltaColor}>
					Delta: {deltaSign}
					{(data.delta * 100).toFixed(1)}%
				</p>
			</div>
		);
	}
	return null;
}

interface ChartData {
	name: string;
	fullName: string;
	blind: number;
	informed: number;
	delta: number;
	raw: BlindInformedBreakdown;
}

function prepareChartData(breakdowns: BlindInformedBreakdown[]): ChartData[] {
	return breakdowns.map((b) => ({
		name: b.name.length > 20 ? `${b.name.slice(0, 18)}...` : b.name,
		fullName: b.name,
		blind: b.blindPassRate * 100,
		informed: b.informedPassRate * 100,
		delta: b.delta * 100,
		raw: b,
	}));
}

function BlindInformedBarChart({ data }: { data: ChartData[] }) {
	if (data.length === 0) {
		return (
			<p className="text-foreground-faint text-sm py-8 text-center">
				No blind/informed comparison data available.
			</p>
		);
	}

	// Check if we have meaningful data (both blind and informed for at least one group)
	const hasBothTypes = data.some(
		(d) => d.raw.blindTotal > 0 && d.raw.informedTotal > 0,
	);

	if (!hasBothTypes) {
		return (
			<p className="text-foreground-faint text-sm py-8 text-center">
				Run both blind and informed prompts to see comparison.
			</p>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={Math.max(200, data.length * 45)}>
			<BarChart
				data={data}
				layout="vertical"
				margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
				barCategoryGap="25%"
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
					tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 12 }}
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
											payload: BlindInformedBreakdown;
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
					x={50}
					stroke="hsl(210, 12%, 40%)"
					strokeDasharray="3 3"
				/>
				<Bar
					dataKey="blind"
					name="Blind"
					fill={COLORS.blind}
					radius={[0, 4, 4, 0]}
				/>
				<Bar
					dataKey="informed"
					name="Informed"
					fill={COLORS.informed}
					radius={[0, 4, 4, 0]}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}

// Delta summary table
function DeltaSummary({ data }: { data: ChartData[] }) {
	const validData = data.filter(
		(d) => d.raw.blindTotal > 0 && d.raw.informedTotal > 0,
	);

	if (validData.length === 0) return null;

	const avgDelta =
		validData.reduce((sum, d) => sum + d.delta, 0) / validData.length;
	const improved = validData.filter((d) => d.delta > 0).length;
	const degraded = validData.filter((d) => d.delta < 0).length;
	const unchanged = validData.filter((d) => d.delta === 0).length;

	return (
		<div className="grid grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-border">
			<div>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={blindInformedTooltips.avgDelta}
						side="bottom"
					>
						Avg Delta
					</WithInfoTooltip>
				</p>
				<p
					className={`text-lg font-bold tabular-nums ${
						avgDelta >= 0 ? "text-success" : "text-danger"
					}`}
				>
					{avgDelta >= 0 ? "+" : ""}
					{avgDelta.toFixed(1)}%
				</p>
			</div>
			<div>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={blindInformedTooltips.improved}
						side="bottom"
					>
						Improved
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums text-success">
					{improved}
				</p>
			</div>
			<div>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={blindInformedTooltips.degraded}
						side="bottom"
					>
						Degraded
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums text-danger">{degraded}</p>
			</div>
			<div>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={blindInformedTooltips.unchanged}
						side="bottom"
					>
						Unchanged
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums text-foreground-muted">
					{unchanged}
				</p>
			</div>
		</div>
	);
}

/**
 * Renders blind-vs-informed pass-rate chart tabs by model and harness.
 *
 * @param items - Benchmark rows used to compute model and harness breakdowns.
 * @returns React element containing chart tabs for model and harness breakdowns.
 * @throws {Error} If already-validated items hit an unexpected aggregation or rendering invariant.
 */
export function BlindVsInformedChart({ items }: BlindVsInformedChartProps) {
	const byModel = computeBlindInformedBreakdown(items, groupByModel);
	const byHarness = computeBlindInformedBreakdown(items, groupByHarness);

	const modelData = prepareChartData(byModel);
	const harnessData = prepareChartData(byHarness);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={blindInformedTooltips.title}>
						Blind vs Informed
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={blindInformedTooltips.description}
						side="right"
					>
						Pass rate comparison: blind prompts (amber) vs informed with hints
						(green)
					</WithInfoTooltip>
				</p>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="model">
					<TabsList>
						<TabsTrigger value="model">By Model</TabsTrigger>
						<TabsTrigger value="harness">By Harness</TabsTrigger>
					</TabsList>
					<TabsContent value="model" className="mt-4">
						<BlindInformedBarChart data={modelData} />
						<DeltaSummary data={modelData} />
					</TabsContent>
					<TabsContent value="harness" className="mt-4">
						<BlindInformedBarChart data={harnessData} />
						<DeltaSummary data={harnessData} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
