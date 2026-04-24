/**
 * Purpose: Token efficiency scatter chart (tokens vs pass rate).
 * Exports: TokenEfficiencyChart
 *
 * Invariants:
 * - ScatterChart: X=avg completion tokens, Y=pass rate
 * - Point size = item count, color = harness
 * - Shows cost-effectiveness of models
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeTokenEfficiencyData } from "@/lib/aggregations";
import { tokenEfficiency as tokenTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { useMemo } from "react";
import {
	CartesianGrid,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
	ZAxis,
} from "recharts";

interface TokenEfficiencyChartProps {
	items: MatrixItemResult[];
}

const HARNESS_COLORS = {
	direct: "hsl(215, 70%, 62%)", // steel blue
	goose: "hsl(142, 60%, 49%)", // brand green
	opencode: "hsl(38, 80%, 58%)", // warm amber
} as const;

function TokenTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		payload: {
			model: string;
			harness: string;
			avgTokens: number;
			passRate: number;
			itemCount: number;
		};
	}>;
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			<p className="font-medium">{d.model}</p>
			<p className="text-foreground-muted text-xs">{d.harness}</p>
			<p className="text-foreground-muted mt-1">
				Avg tokens: {d.avgTokens.toLocaleString()}
			</p>
			<p className="text-foreground-muted">
				Pass rate: {d.passRate.toFixed(1)}%
			</p>
			<p className="text-foreground-faint text-xs">{d.itemCount} items</p>
		</div>
	);
}

/**
 * Renders token efficiency scatter chart.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Card with scatter visualization
 */
export function TokenEfficiencyChart({ items }: TokenEfficiencyChartProps) {
	const data = useMemo(() => computeTokenEfficiencyData(items), [items]);

	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={tokenTooltips.title}>
							Token Efficiency
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						No token usage data available.
					</p>
				</CardContent>
			</Card>
		);
	}

	const harnesses = [...new Set(data.map((d) => d.harness))];
	const dataByHarness = harnesses.map((harness) => ({
		harness,
		points: data.filter((d) => d.harness === harness),
		color:
			HARNESS_COLORS[harness as keyof typeof HARNESS_COLORS] ||
			"hsl(210, 12%, 63%)",
	}));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={tokenTooltips.title}>
						Token Efficiency
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{tokenTooltips.description}
				</p>
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
					<ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
						<CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
						<XAxis
							type="number"
							dataKey="avgTokens"
							name="Avg Tokens"
							stroke="hsl(210, 12%, 63%)"
							tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							tickFormatter={(v) =>
								v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
							}
							label={{
								value: "Avg Completion Tokens",
								position: "bottom",
								fill: "hsl(210, 12%, 63%)",
								fontSize: 12,
							}}
						/>
						<YAxis
							type="number"
							dataKey="passRate"
							name="Pass Rate"
							domain={[0, 100]}
							stroke="hsl(210, 12%, 63%)"
							tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							tickFormatter={(v) => `${v}%`}
							label={{
								value: "Pass Rate",
								angle: -90,
								position: "insideLeft",
								fill: "hsl(210, 12%, 63%)",
								fontSize: 12,
							}}
						/>
						<ZAxis
							type="number"
							dataKey="itemCount"
							range={[40, 200]}
							name="Items"
						/>
						<Tooltip content={<TokenTooltip />} />
						{dataByHarness.map(({ harness, points, color }) => (
							<Scatter
								key={harness}
								name={harness}
								data={points}
								fill={color}
							/>
						))}
					</ScatterChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
