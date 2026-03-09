/**
 * Purpose: Model-level prompt-sensitivity chart for blind vs informed deltas.
 * Exports: PromptLiftChart
 *
 * Invariants:
 * - Positive values mean informed prompts improved pass rate
 * - Chart only shows models with both prompt modes present
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computePromptLiftRows } from "@/lib/aggregations";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration, formatPercent } from "@/lib/utils";
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

interface PromptLiftChartProps {
	items: MatrixItemResult[];
}

interface PromptLiftPoint {
	name: string;
	blind: number;
	informed: number;
	lift: number;
	frontierAvg: number | null;
	medianDurationMs: number | null;
}

function PromptLiftTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: PromptLiftPoint }>;
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
				Blind: {formatPercent(point.blind / 100)}
			</p>
			<p className="text-foreground-muted">
				Informed: {formatPercent(point.informed / 100)}
			</p>
			<p className={point.lift >= 0 ? "text-success" : "text-danger"}>
				Delta: {point.lift >= 0 ? "+" : ""}
				{point.lift.toFixed(1)}%
			</p>
			{point.frontierAvg !== null && (
				<p className="text-foreground-muted">
					Frontier: {point.frontierAvg.toFixed(1)}/10
				</p>
			)}
			{point.medianDurationMs !== null && (
				<p className="text-foreground-muted">
					Median latency: {formatDuration(Math.round(point.medianDurationMs))}
				</p>
			)}
		</div>
	);
}

/**
 * Renders prompt-lift comparison for the strongest models in scope.
 *
 * @param props - Chart props
 * @param props.items - Filtered leaderboard items
 * @returns React element containing prompt sensitivity deltas
 */
export function PromptLiftChart({ items }: PromptLiftChartProps) {
	const data: PromptLiftPoint[] = computePromptLiftRows(items)
		.sort((left, right) => Math.abs(right.lift) - Math.abs(left.lift))
		.slice(0, 10)
		.map((row) => ({
			name: row.name.length > 22 ? `${row.name.slice(0, 20)}...` : row.name,
			blind: row.blindPassRate * 100,
			informed: row.informedPassRate * 100,
			lift: row.lift * 100,
			frontierAvg: row.frontierAvg,
			medianDurationMs: row.medianDurationMs,
		}));
	const maxLift = data.reduce(
		(maximum, row) => Math.max(maximum, Math.abs(row.lift)),
		10,
	);

	return (
		<Card className="border-border/80 bg-card/85 backdrop-blur">
			<CardHeader>
				<CardTitle className="text-base">Prompt sensitivity</CardTitle>
				<p className="text-sm leading-6 text-foreground-muted">
					How much informed prompts help or hurt each model. Large positive bars
					usually indicate scaffolding matters more than raw zero-shot strength.
				</p>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<p className="py-12 text-center text-sm text-foreground-faint">
						Run both blind and informed prompts to unlock prompt-lift analysis.
					</p>
				) : (
					<ResponsiveContainer width="100%" height={360}>
						<BarChart
							data={data}
							layout="vertical"
							margin={{ top: 8, right: 24, bottom: 8, left: 92 }}
						>
							<CartesianGrid stroke="hsl(213, 23%, 15%)" strokeDasharray="3 3" />
							<XAxis
								type="number"
								domain={[-maxLift, maxLift]}
								tickFormatter={(value) => `${value}%`}
								stroke="hsl(210, 12%, 63%)"
								tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							/>
							<YAxis
								type="category"
								dataKey="name"
								width={88}
								stroke="hsl(210, 12%, 63%)"
								tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 12 }}
							/>
							<Tooltip content={<PromptLiftTooltip />} />
							<ReferenceLine x={0} stroke="hsl(210, 12%, 40%)" />
							<Bar dataKey="lift" radius={[0, 4, 4, 0]}>
								{data.map((row) => (
									<Cell
										key={row.name}
										fill={
											row.lift >= 0
												? "hsl(156, 67%, 55%)"
												: "hsl(0, 100%, 68%)"
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				)}
			</CardContent>
		</Card>
	);
}
