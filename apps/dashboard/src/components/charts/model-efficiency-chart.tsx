/**
 * Purpose: Bubble chart comparing model pass rate against median latency.
 * Exports: ModelEfficiencyChart
 *
 * Invariants:
 * - Uses current filter scope only
 * - Bubble size reflects sample size so sparse evidence stays visible
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeModelInsights, computePassRate } from "@/lib/aggregations";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import {
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
	ZAxis,
} from "recharts";

interface ModelEfficiencyChartProps {
	items: MatrixItemResult[];
}

interface EfficiencyPoint {
	name: string;
	passRate: number;
	medianDurationMs: number;
	totalItems: number;
	frontierAvg: number | null;
	informedLift: number | null;
}

function getPointColor(point: EfficiencyPoint): string {
	if ((point.informedLift ?? 0) >= 0.12) {
		return "hsl(43, 93%, 63%)";
	}
	if (point.passRate >= 80) {
		return "hsl(156, 67%, 55%)";
	}
	if (point.passRate >= 55) {
		return "hsl(212, 100%, 67%)";
	}
	return "hsl(0, 100%, 68%)";
}

function EfficiencyTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: EfficiencyPoint }>;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}

	const point = payload[0]?.payload;
	if (!point) {
		return null;
	}

	return (
		<div className="rounded border border-border bg-background-raised p-3 text-sm">
			<p className="font-semibold text-foreground">{point.name}</p>
			<p className="mt-1 text-foreground-muted">
				Pass: {point.passRate.toFixed(1)}%
			</p>
			<p className="text-foreground-muted">
				Median latency: {formatDuration(Math.round(point.medianDurationMs))}
			</p>
			<p className="text-foreground-muted">
				Sample: {point.totalItems} items
			</p>
			{point.frontierAvg !== null && (
				<p className="text-foreground-muted">
					Frontier: {point.frontierAvg.toFixed(1)}/10
				</p>
			)}
			{point.informedLift !== null && (
				<p className={point.informedLift >= 0 ? "text-success" : "text-danger"}>
					Prompt lift: {point.informedLift >= 0 ? "+" : ""}
					{(point.informedLift * 100).toFixed(1)}%
				</p>
			)}
		</div>
	);
}

function CustomShape(props: {
	cx?: number;
	cy?: number;
	payload?: EfficiencyPoint;
}) {
	const { cx = 0, cy = 0, payload } = props;
	if (!payload) {
		return null;
	}

	return (
		<circle
			cx={cx}
			cy={cy}
			r={10}
			fill={getPointColor(payload)}
			fillOpacity={0.78}
			stroke="hsl(210, 30%, 92%)"
			strokeOpacity={0.45}
			strokeWidth={1}
		/>
	);
}

/**
 * Renders the latency-vs-quality comparison bubble chart.
 *
 * @param props - Chart props
 * @param props.items - Filtered leaderboard items
 * @returns React element containing the efficiency frontier plot
 */
export function ModelEfficiencyChart({ items }: ModelEfficiencyChartProps) {
	const data: EfficiencyPoint[] = [];
	for (const insight of computeModelInsights(items)) {
		if (insight.medianDurationMs === null) {
			continue;
		}

		data.push({
			name: insight.name,
			passRate: insight.passRate * 100,
			medianDurationMs: insight.medianDurationMs,
			totalItems: insight.totalItems,
			frontierAvg: insight.frontierAvg,
			informedLift: insight.informedLift,
		});
	}
	const overallPassRate = computePassRate(items).passRate * 100;
	const overallMedianLatency =
		data.length > 0
			? data.reduce((sum, point) => sum + point.medianDurationMs, 0) / data.length
			: 0;

	return (
		<Card className="border-border/80 bg-card/85 backdrop-blur">
			<CardHeader>
				<CardTitle className="text-base">Speed vs quality frontier</CardTitle>
				<p className="text-sm leading-6 text-foreground-muted">
					Each bubble is one model. Up is better quality, left is faster, and
					larger circles mean more evidence inside the current filter scope.
				</p>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<p className="py-12 text-center text-sm text-foreground-faint">
						No timing data is available for the current filter scope.
					</p>
				) : (
					<ResponsiveContainer width="100%" height={360}>
						<ScatterChart margin={{ top: 16, right: 24, bottom: 20, left: 8 }}>
							<CartesianGrid stroke="hsl(213, 23%, 15%)" strokeDasharray="3 3" />
							<XAxis
								type="number"
								dataKey="medianDurationMs"
								name="Median latency"
								tickFormatter={(value) => formatDuration(Math.round(value))}
								stroke="hsl(210, 12%, 63%)"
								tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							/>
							<YAxis
								type="number"
								dataKey="passRate"
								name="Pass rate"
								domain={[0, 100]}
								tickFormatter={(value) => `${value}%`}
								stroke="hsl(210, 12%, 63%)"
								tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							/>
							<ZAxis type="number" dataKey="totalItems" range={[90, 420]} />
							<Tooltip content={<EfficiencyTooltip />} cursor={{ strokeDasharray: "4 4" }} />
							<ReferenceLine
								x={overallMedianLatency}
								stroke="hsl(212, 100%, 67%)"
								strokeDasharray="4 4"
							/>
							<ReferenceLine
								y={overallPassRate}
								stroke="hsl(156, 67%, 55%)"
								strokeDasharray="4 4"
							/>
							<Scatter data={data} shape={<CustomShape />} />
						</ScatterChart>
					</ResponsiveContainer>
				)}
			</CardContent>
		</Card>
	);
}
