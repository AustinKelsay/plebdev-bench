/**
 * Purpose: Test difficulty ranking horizontal bar chart.
 * Exports: TestDifficultyChart
 *
 * Invariants:
 * - Horizontal bars per test sorted hardest→easiest
 * - Stacked segments by model size bucket (small/medium/large)
 * - Shows which tasks genuinely challenge models vs trivially solved
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeTestDifficultyData } from "@/lib/aggregations";
import { SIZE_BUCKET_COLORS } from "@/lib/chart-colors";
import { testDifficulty as difficultyTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface TestDifficultyChartProps {
	items: MatrixItemResult[];
}

function DifficultyTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		color: string;
		payload: {
			test: string;
			failureRate: number;
			small: number;
			medium: number;
			large: number;
		};
	}>;
}) {
	if (!active || !payload?.length) return null;

	const data = payload[0].payload;

	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			<p className="font-medium mb-1">{data.test}</p>
			<p className="text-foreground-muted">
				Failure rate: {(data.failureRate * 100).toFixed(1)}%
			</p>
			{data.small > 0 && (
				<p style={{ color: SIZE_BUCKET_COLORS.small }}>Small: {data.small}</p>
			)}
			{data.medium > 0 && (
				<p style={{ color: SIZE_BUCKET_COLORS.medium }}>
					Medium: {data.medium}
				</p>
			)}
			{data.large > 0 && (
				<p style={{ color: SIZE_BUCKET_COLORS.large }}>Large: {data.large}</p>
			)}
		</div>
	);
}

/**
 * Renders test difficulty ranking as horizontal stacked bars.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Card with difficulty ranking chart
 */
export function TestDifficultyChart({ items }: TestDifficultyChartProps) {
	const data = useMemo(() => computeTestDifficultyData(items), [items]);

	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={difficultyTooltips.title}>
							Test Difficulty
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						No test data available.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={difficultyTooltips.title}>
						Test Difficulty
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{difficultyTooltips.description}
				</p>
			</CardHeader>
			<CardContent>
				<ResponsiveContainer
					width="100%"
					height={Math.max(200, data.length * 40)}
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
							stroke="hsl(210, 12%, 63%)"
							tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
							label={{
								value: "Failures by model size",
								position: "bottom",
								fill: "hsl(210, 12%, 63%)",
								fontSize: 11,
							}}
						/>
						<YAxis
							type="category"
							dataKey="test"
							width={90}
							stroke="hsl(210, 12%, 63%)"
							tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 11 }}
						/>
						<Tooltip content={<DifficultyTooltip />} />
						<Legend
							wrapperStyle={{ paddingTop: "10px" }}
							formatter={(value) => (
								<span className="text-foreground-muted text-xs">{value}</span>
							)}
						/>
						<Bar
							dataKey="small"
							name="Small models"
							stackId="difficulty"
							fill={SIZE_BUCKET_COLORS.small}
							radius={0}
						/>
						<Bar
							dataKey="medium"
							name="Medium models"
							stackId="difficulty"
							fill={SIZE_BUCKET_COLORS.medium}
							radius={0}
						/>
						<Bar
							dataKey="large"
							name="Large models"
							stackId="difficulty"
							fill={SIZE_BUCKET_COLORS.large}
							radius={0}
						/>
					</BarChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
