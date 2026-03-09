/**
 * Purpose: Timing distribution histogram using Recharts.
 * Shows distribution of generation durations with p50/p90 markers.
 * Enhanced with "By Model" tab for per-model timing comparison.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHART_COLORS, MODEL_PALETTE } from "@/lib/chart-colors";
import { timingDistribution as timingDistributionTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { useMemo } from "react";
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

interface TimingDistributionProps {
	items: MatrixItemResult[];
}

function HistogramTooltip({
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

function ModelTimingTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: Array<{ name: string; value: number; color: string }>;
	label?: string;
}) {
	if (!active || !payload?.length) return null;
	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			<p className="font-medium mb-1">{label}</p>
			{payload
				.filter((p) => p.value > 0)
				.map((p) => (
					<p key={p.name} style={{ color: p.color }}>
						{p.name}: {formatDuration(p.value)}
					</p>
				))}
		</div>
	);
}

function createHistogramBins(
	durations: number[],
	binCount = 10,
): Array<{ range: string; count: number; min: number; max: number }> {
	if (durations.length === 0) return [];

	const sorted = [...durations].sort((a, b) => a - b);
	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const binSize = (max - min) / binCount || 1;

	const bins: Array<{
		range: string;
		count: number;
		min: number;
		max: number;
	}> = [];

	for (let i = 0; i < binCount; i++) {
		const binMin = min + i * binSize;
		const binMax = min + (i + 1) * binSize;
		const count = durations.filter(
			(d) => d >= binMin && (i === binCount - 1 ? d <= binMax : d < binMax),
		).length;

		bins.push({
			range: `${formatDuration(binMin)} - ${formatDuration(binMax)}`,
			count,
			min: binMin,
			max: binMax,
		});
	}

	return bins;
}

function percentile(sorted: number[], p: number): number {
	const index = Math.floor(sorted.length * p);
	return sorted[Math.min(index, sorted.length - 1)];
}

interface ModelTimingData {
	model: string;
	median: number;
	p90: number;
	count: number;
}

function computeModelTimingData(items: MatrixItemResult[]): ModelTimingData[] {
	const modelGroups = new Map<string, number[]>();
	for (const item of items) {
		const d = item.generation?.durationMs;
		if (d === undefined) continue;
		if (!modelGroups.has(item.model)) modelGroups.set(item.model, []);
		modelGroups.get(item.model)!.push(d);
	}

	const rows: ModelTimingData[] = [];
	for (const [model, durations] of modelGroups) {
		const sorted = [...durations].sort((a, b) => a - b);
		rows.push({
			model: model.length > 20 ? `${model.slice(0, 18)}..` : model,
			median: percentile(sorted, 0.5),
			p90: percentile(sorted, 0.9),
			count: sorted.length,
		});
	}

	return rows.sort((a, b) => a.median - b.median);
}

export function TimingDistribution({ items }: TimingDistributionProps) {
	const durations = items
		.map((item) => item.generation?.durationMs)
		.filter((d): d is number => d !== undefined);

	const modelTimingData = useMemo(() => computeModelTimingData(items), [items]);

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

	const p50BinIndex = bins.findIndex((b) => p50 >= b.min && p50 <= b.max);
	const p90BinIndex = bins.findIndex((b) => p90 >= b.min && p90 <= b.max);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={timingDistributionTooltips.title}>
						Timing Distribution
					</WithInfoTooltip>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex gap-4 mb-4 text-sm">
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip
								tooltip={timingDistributionTooltips.p50}
								side="bottom"
							>
								p50
							</WithInfoTooltip>
							:{" "}
						</span>
						<span className="font-medium">{formatDuration(p50)}</span>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip
								tooltip={timingDistributionTooltips.p90}
								side="bottom"
							>
								p90
							</WithInfoTooltip>
							:{" "}
						</span>
						<span className="font-medium">{formatDuration(p90)}</span>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip
								tooltip={timingDistributionTooltips.items}
								side="bottom"
							>
								Items
							</WithInfoTooltip>
							:{" "}
						</span>
						<span className="font-medium">{durations.length}</span>
					</div>
				</div>

				<Tabs defaultValue="histogram">
					<TabsList>
						<TabsTrigger value="histogram">Distribution</TabsTrigger>
						<TabsTrigger value="byModel">By Model</TabsTrigger>
					</TabsList>

					<TabsContent value="histogram" className="mt-4">
						<ResponsiveContainer width="100%" height={200}>
							<BarChart
								data={bins}
								margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke={CHART_COLORS.grid}
								/>
								<XAxis
									dataKey="range"
									stroke={CHART_COLORS.text}
									tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
									angle={-45}
									textAnchor="end"
									height={60}
								/>
								<YAxis
									stroke={CHART_COLORS.text}
									tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
								/>
								<Tooltip content={<HistogramTooltip />} />
								<Bar
									dataKey="count"
									fill={CHART_COLORS.info}
									radius={[4, 4, 0, 0]}
								/>
								{p50BinIndex >= 0 && (
									<ReferenceLine
										x={bins[p50BinIndex].range}
										stroke={CHART_COLORS.passRate}
										strokeDasharray="5 5"
										label={{
											value: "p50",
											fill: CHART_COLORS.passRate,
											fontSize: 10,
										}}
									/>
								)}
								{p90BinIndex >= 0 && (
									<ReferenceLine
										x={bins[p90BinIndex].range}
										stroke={CHART_COLORS.warning}
										strokeDasharray="5 5"
										label={{
											value: "p90",
											fill: CHART_COLORS.warning,
											fontSize: 10,
										}}
									/>
								)}
							</BarChart>
						</ResponsiveContainer>
					</TabsContent>

					<TabsContent value="byModel" className="mt-4">
						{modelTimingData.length === 0 ? (
							<p className="text-foreground-faint text-sm py-8 text-center">
								No per-model timing data.
							</p>
						) : (
							<ResponsiveContainer
								width="100%"
								height={Math.max(200, modelTimingData.length * 40)}
							>
								<BarChart
									data={modelTimingData}
									layout="vertical"
									margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
								>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke={CHART_COLORS.grid}
									/>
									<XAxis
										type="number"
										stroke={CHART_COLORS.text}
										tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
										tickFormatter={(v) => formatDuration(v)}
									/>
									<YAxis
										type="category"
										dataKey="model"
										width={90}
										stroke={CHART_COLORS.text}
										tick={{
											fill: CHART_COLORS.foreground,
											fontSize: 11,
										}}
									/>
									<Tooltip content={<ModelTimingTooltip />} />
									<Legend
										wrapperStyle={{ paddingTop: "10px" }}
										formatter={(value) => (
											<span className="text-foreground-muted text-xs">
												{value}
											</span>
										)}
									/>
									<Bar
										dataKey="median"
										name="Median (p50)"
										fill={MODEL_PALETTE[0]}
										radius={[0, 4, 4, 0]}
									/>
									<Bar
										dataKey="p90"
										name="p90"
										fill={MODEL_PALETTE[2]}
										radius={[0, 4, 4, 0]}
										fillOpacity={0.6}
									/>
								</BarChart>
							</ResponsiveContainer>
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
