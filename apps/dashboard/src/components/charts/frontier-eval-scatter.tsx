/**
 * Purpose: Frontier eval scatter plot using Recharts.
 * Shows relationship between automated pass rate and frontier eval score.
 * Enhanced with quadrant labels and token-based point sizing.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeItemPassRate } from "@/lib/aggregations";
import { CHART_COLORS } from "@/lib/chart-colors";
import { scatter as scatterTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import {
	CartesianGrid,
	Label,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
	ZAxis,
} from "recharts";

interface FrontierEvalScatterProps {
	items: MatrixItemResult[];
}

const HARNESS_COLORS: Record<string, string> = {
	direct: "hsl(215, 70%, 62%)", // steel blue
	goose: "hsl(142, 60%, 49%)", // brand green
	opencode: "hsl(38, 80%, 58%)", // warm amber
};

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
			tokens: number | null;
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
				{data.tokens !== null && (
					<p className="text-foreground-faint text-xs">
						Tokens: {data.tokens.toLocaleString()}
					</p>
				)}
			</div>
		);
	}
	return null;
}

export function FrontierEvalScatter({ items }: FrontierEvalScatterProps) {
	const dataPoints = items
		.filter((item) => item.automatedScore && item.frontierEval)
		.map((item) => ({
			passRate: computeItemPassRate(item.automatedScore!),
			score: item.frontierEval!.score,
			model: item.model,
			harness: item.harness,
			test: item.test,
			tokens: item.generation?.completionTokens ?? null,
		}));

	if (dataPoints.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Frontier Eval vs Pass Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						No items with both automated score and frontier eval.
					</p>
				</CardContent>
			</Card>
		);
	}

	const harnesses = [...new Set(dataPoints.map((d) => d.harness))];
	const dataByHarness = harnesses.map((harness) => ({
		harness,
		data: dataPoints.filter((d) => d.harness === harness),
		color: HARNESS_COLORS[harness] || CHART_COLORS.muted,
	}));

	// Determine if we have token data for point sizing
	const hasTokenData = dataPoints.some((d) => d.tokens !== null);
	const zRange: [number, number] = hasTokenData ? [30, 120] : [60, 60];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={scatterTooltips.title}>
						Frontier Eval vs Pass Rate
					</WithInfoTooltip>
				</CardTitle>
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
						<CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
						<XAxis
							type="number"
							dataKey="passRate"
							domain={[0, 1]}
							tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
							name="Pass Rate"
							stroke={CHART_COLORS.text}
							tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
							label={{
								value: "Automated Pass Rate",
								position: "bottom",
								fill: CHART_COLORS.text,
								fontSize: 12,
							}}
						/>
						<YAxis
							type="number"
							dataKey="score"
							domain={[0, 10]}
							name="Frontier Score"
							stroke={CHART_COLORS.text}
							tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
							label={{
								value: "Frontier Score",
								angle: -90,
								position: "insideLeft",
								fill: CHART_COLORS.text,
								fontSize: 12,
							}}
						/>
						<ZAxis
							type="number"
							dataKey="tokens"
							range={zRange}
							name="Tokens"
						/>
						{/* Quadrant reference lines */}
						<ReferenceLine
							x={0.5}
							stroke="hsl(210, 12%, 25%)"
							strokeDasharray="3 3"
						/>
						<ReferenceLine
							y={5}
							stroke="hsl(210, 12%, 25%)"
							strokeDasharray="3 3"
						>
							<Label
								value="High Eval"
								position="insideTopRight"
								fill="hsl(210, 10%, 35%)"
								fontSize={9}
							/>
						</ReferenceLine>
						<Tooltip content={<CustomTooltip />} />
						{dataByHarness.map(({ harness, data, color }) => (
							<Scatter key={harness} name={harness} data={data} fill={color} />
						))}
					</ScatterChart>
				</ResponsiveContainer>

				<p className="text-xs text-foreground-faint mt-2 text-center">
					<WithInfoTooltip tooltip={scatterTooltips.correlation} side="top">
						Points show correlation between automated test pass rate and
						frontier model evaluation score.
					</WithInfoTooltip>
				</p>
			</CardContent>
		</Card>
	);
}
