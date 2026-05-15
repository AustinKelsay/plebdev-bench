/**
 * Purpose: Dedicated chart showing per-model pass rates split by benchmark test type.
 * Exports: TestTypeSplitChart
 *
 * Invariants:
 * - Uses dynamic category series so future test types render automatically
 * - Sorts models by spread (best vs worst test-type pass rate)
 * - Expects filtered aggregate items from the leaderboard page
 */

import { ChartTooltipWrapper } from "@/components/charts/chart-primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import {
	type TestTypeComparisonRow,
	computeTestTypeComparisonData,
} from "@/lib/aggregations";
import { CHART_COLORS, getTestTypeColor } from "@/lib/chart-colors";
import { testTypeSplit as testTypeSplitTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { formatTestCategoryLabel } from "@/lib/utils";
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

interface TestTypeSplitChartProps {
	items: MatrixItemResult[];
}

interface ChartSeries {
	slug: string;
	label: string;
	dataKey: string;
	color: string;
}

interface ChartDataRow {
	name: string;
	fullName: string;
	raw: TestTypeComparisonRow;
	[dataKey: string]: string | number | TestTypeComparisonRow | null;
}

/**
 * Truncates a long model label for chart ticks.
 *
 * @param value - Full model name
 * @returns Chart-friendly short label
 */
function truncateLabel(value: string): string {
	return value.length > 24 ? `${value.slice(0, 22)}..` : value;
}

/**
 * Builds a stable Recharts data key from a category slug.
 *
 * @param category - Category slug from aggregate rows
 * @returns Safe property key for chart data objects
 */
function buildCategoryDataKey(category: string): string {
	return `testType_${category.replace(/[^a-z0-9]+/gi, "_")}`;
}

/**
 * Prepares chart-ready rows and category series from comparison data.
 *
 * @param items - Filtered aggregate items
 * @returns Dynamic series plus rows for grouped horizontal bars
 */
function prepareChartData(items: MatrixItemResult[]): {
	rows: ChartDataRow[];
	series: ChartSeries[];
} {
	const comparison = computeTestTypeComparisonData(items);
	const series = comparison.categories.map((category, index) => ({
		slug: category.slug,
		label: formatTestCategoryLabel(category.slug),
		dataKey: buildCategoryDataKey(category.slug),
		color: getTestTypeColor(category.slug, index),
	}));

	const rows = comparison.rows.map((row) => {
		const chartRow: ChartDataRow = {
			name: truncateLabel(row.model),
			fullName: row.model,
			raw: row,
		};

		for (const entry of series) {
			chartRow[entry.dataKey] =
				row.metrics[entry.slug] !== undefined
					? row.metrics[entry.slug].passRate * 100
					: null;
		}

		return chartRow;
	});

	return { rows, series };
}

function TestTypeSplitTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: ChartDataRow }>;
}) {
	if (!active || !payload?.length) return null;

	const row = payload[0].payload.raw;
	const metrics = Object.values(row.metrics).sort((left, right) => {
		if (right.passRate !== left.passRate) return right.passRate - left.passRate;
		return left.category.localeCompare(right.category);
	});

	return (
		<ChartTooltipWrapper>
			<p className="font-medium mb-1">{row.model}</p>
			{metrics.map((metric) => (
				<p key={metric.category} className="text-foreground-muted">
					{formatTestCategoryLabel(metric.category)}:{" "}
					<span className="text-foreground">
						{(metric.passRate * 100).toFixed(1)}%
					</span>{" "}
					({metric.passed}/{metric.total})
				</p>
			))}
			<p className="text-foreground-muted text-xs mt-2">
				Spread: {(row.spread * 100).toFixed(1)} pp
			</p>
			<p className="text-foreground-muted text-xs">
				Average: {(row.averagePassRate * 100).toFixed(1)}%
			</p>
		</ChartTooltipWrapper>
	);
}

/**
 * Renders the dedicated model-vs-test-type split chart.
 *
 * @param props - Component props
 * @param props.items - Filtered aggregate items
 * @returns Chart card highlighting specialization across test types
 */
export function TestTypeSplitChart({ items }: TestTypeSplitChartProps) {
	const { rows, series } = useMemo(() => prepareChartData(items), [items]);
	const mostSpecializedRow = rows[0]?.raw ?? null;
	const visibleTypes = series.map((entry) => entry.label);

	if (series.length < 2) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={testTypeSplitTooltips.title}>
							Test Type Split
						</WithInfoTooltip>
					</CardTitle>
					<p className="text-xs text-foreground-muted">
						{testTypeSplitTooltips.description}
					</p>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						Need at least 2 visible test types after filters to compare task
						specialization.
					</p>
				</CardContent>
			</Card>
		);
	}

	if (rows.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={testTypeSplitTooltips.title}>
							Test Type Split
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						No categorized scoring data available.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={testTypeSplitTooltips.title}>
						Test Type Split
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					<WithInfoTooltip
						tooltip={testTypeSplitTooltips.description}
						side="right"
					>
						Per-model pass rate split by benchmark test type.
					</WithInfoTooltip>{" "}
					Sorted by spread so category specialists surface first.
				</p>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 md:grid-cols-3 mb-4">
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-faint">Visible Test Types</p>
						<p className="text-sm font-medium">{visibleTypes.join(" · ")}</p>
					</div>
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-faint">
							<WithInfoTooltip
								tooltip={testTypeSplitTooltips.spread}
								side="bottom"
							>
								Largest Spread
							</WithInfoTooltip>
						</p>
						<p className="text-sm font-medium">
							{mostSpecializedRow ? mostSpecializedRow.model : "—"}
						</p>
						<p className="text-xs text-foreground-muted">
							{mostSpecializedRow
								? `${(mostSpecializedRow.spread * 100).toFixed(1)} pp`
								: "—"}
						</p>
					</div>
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-faint">
							<WithInfoTooltip
								tooltip={testTypeSplitTooltips.average}
								side="bottom"
							>
								Models Compared
							</WithInfoTooltip>
						</p>
						<p className="text-sm font-medium">{rows.length}</p>
						<p className="text-xs text-foreground-muted">
							with scored rows in at least one visible test type
						</p>
					</div>
				</div>

				<ResponsiveContainer
					width="100%"
					height={Math.max(260, rows.length * 46)}
				>
					<BarChart
						data={rows}
						layout="vertical"
						margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
						barCategoryGap="24%"
					>
						<CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
						<XAxis
							type="number"
							domain={[0, 100]}
							tickFormatter={(value) => `${value}%`}
							stroke={CHART_COLORS.text}
							tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
						/>
						<YAxis
							type="category"
							dataKey="name"
							width={110}
							stroke={CHART_COLORS.text}
							tick={{ fill: CHART_COLORS.foreground, fontSize: 12 }}
						/>
						<Tooltip content={<TestTypeSplitTooltip />} />
						<Legend
							wrapperStyle={{ paddingTop: "10px" }}
							formatter={(value) => (
								<span className="text-foreground-muted text-xs">{value}</span>
							)}
						/>
						{series.map((entry) => (
							<Bar
								key={entry.slug}
								dataKey={entry.dataKey}
								name={entry.label}
								fill={entry.color}
								radius={[0, 4, 4, 0]}
							/>
						))}
					</BarChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
