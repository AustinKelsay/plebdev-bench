/**
 * Purpose: Head-to-head model comparison with diverging bar chart.
 * Exports: ModelComparisonChart
 *
 * Invariants:
 * - Two model selector dropdowns
 * - Diverging horizontal bars: model A left, model B right
 * - Each row = a test, color intensity = win/loss magnitude
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { computeHeadToHeadData, groupByModel } from "@/lib/aggregations";
import { CHART_COLORS } from "@/lib/chart-colors";
import { headToHead as h2hTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { z } from "zod";

interface ModelComparisonChartProps {
	items: MatrixItemResult[];
}

const ModelComparisonChartPropsSchema = z.object({
	items: z.array(z.custom<MatrixItemResult>()),
});

/**
 * Renders the head-to-head tooltip for a single test row.
 *
 * @param props - Tooltip activation state and Recharts payload entries
 * @param props.active - Whether the tooltip is currently active
 * @param props.payload - Payload entries containing test, model scores, and delta
 * @returns Tooltip markup for the active row, or `null` when inactive or empty
 */
function ComparisonTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		payload: {
			test: string;
			modelAScore: number;
			modelBScore: number;
			delta: number;
		};
	}>;
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			<p className="font-medium mb-1">{d.test}</p>
			<p className="text-success">Model A: {d.modelAScore.toFixed(1)}%</p>
			<p className="text-info">Model B: {d.modelBScore.toFixed(1)}%</p>
			<p className="text-foreground-muted text-xs mt-1">
				Delta: {d.delta > 0 ? "+" : ""}
				{d.delta.toFixed(1)}%
			</p>
		</div>
	);
}

/**
 * Renders head-to-head model comparison with diverging bars.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Card with model selectors and diverging bar chart
 */
export function ModelComparisonChart(props: ModelComparisonChartProps) {
	const { items } = ModelComparisonChartPropsSchema.parse(props);
	const allModels = useMemo(() => {
		const groups = groupByModel(items);
		return [...groups.keys()].sort();
	}, [items]);

	const [modelA, setModelA] = useState<string>(allModels[0] ?? "");
	const [modelB, setModelB] = useState<string>(allModels[1] ?? "");

	const data = useMemo(() => {
		if (!modelA || !modelB || modelA === modelB) return [];
		return computeHeadToHeadData(items, modelA, modelB);
	}, [items, modelA, modelB]);

	if (allModels.length < 2) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={h2hTooltips.title}>
							Head-to-Head Comparison
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						Need at least 2 models for head-to-head comparison.
					</p>
				</CardContent>
			</Card>
		);
	}

	const truncate = (s: string, n: number) =>
		s.length > n ? `${s.slice(0, n - 2)}..` : s;

	// Summary
	const aWins = data.filter((d) => d.delta > 0).length;
	const bWins = data.filter((d) => d.delta < 0).length;
	const ties = data.filter((d) => d.delta === 0).length;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={h2hTooltips.title}>
						Head-to-Head Comparison
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{h2hTooltips.description}
				</p>
			</CardHeader>
			<CardContent>
				{/* Model selectors */}
				<div className="flex gap-4 mb-4 items-center">
					<div className="flex items-center gap-2">
						<span className="text-xs text-success font-medium">Model A:</span>
						<Select value={modelA} onValueChange={setModelA}>
							<SelectTrigger className="w-48" aria-label="Select Model A">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{allModels.map((m) => (
									<SelectItem key={m} value={m}>
										{truncate(m, 30)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<span className="text-foreground-faint text-sm">vs</span>
					<div className="flex items-center gap-2">
						<span className="text-xs text-info font-medium">Model B:</span>
						<Select value={modelB} onValueChange={setModelB}>
							<SelectTrigger className="w-48" aria-label="Select Model B">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{allModels.map((m) => (
									<SelectItem key={m} value={m}>
										{truncate(m, 30)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{modelA === modelB ? (
					<p className="text-foreground-faint text-sm py-4 text-center">
						Select two different models to compare.
					</p>
				) : data.length === 0 ? (
					<p className="text-foreground-faint text-sm py-4 text-center">
						No overlapping test data for these models.
					</p>
				) : (
					<>
						{/* Summary */}
						<div className="flex gap-4 mb-3 text-xs">
							<span className="text-success">
								{truncate(modelA, 16)} wins: {aWins}
							</span>
							<span className="text-info">
								{truncate(modelB, 16)} wins: {bWins}
							</span>
							{ties > 0 && (
								<span className="text-foreground-faint">Ties: {ties}</span>
							)}
						</div>

						<ResponsiveContainer
							width="100%"
							height={Math.max(200, data.length * 35)}
						>
							<BarChart
								data={data}
								layout="vertical"
								margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="hsl(213, 23%, 15%)"
								/>
								<XAxis
									type="number"
									domain={[-100, 100]}
									tickFormatter={(v) => `${Math.abs(v)}%`}
									stroke="hsl(210, 12%, 63%)"
									tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
								/>
								<YAxis
									type="category"
									dataKey="test"
									width={90}
									stroke="hsl(210, 12%, 63%)"
									tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 11 }}
								/>
								<Tooltip content={<ComparisonTooltip />} />
								<ReferenceLine
									x={0}
									stroke="hsl(210, 12%, 63%)"
									strokeWidth={1}
								/>
								<Bar dataKey="delta" radius={[0, 4, 4, 0]}>
									{data.map((entry) => (
										<Cell
											key={entry.test}
											fill={
												entry.delta >= 0
													? CHART_COLORS.brand
													: CHART_COLORS.info
											}
											fillOpacity={
												Math.min(1, Math.abs(entry.delta) / 50) * 0.7 + 0.3
											}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</>
				)}
			</CardContent>
		</Card>
	);
}
