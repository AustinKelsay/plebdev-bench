/**
 * Purpose: Reliability chart showing completion/failure mix by dimension.
 * Exports: StatusCompositionChart
 *
 * Invariants:
 * - Uses stacked bars so missing vs completed volume is easy to compare
 * - Tabs let visitors switch the failure lens without changing page scope
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	computeStatusBreakdown,
	groupByHarness,
	groupByModel,
	groupByTest,
} from "@/lib/aggregations";
import type { MatrixItemResult } from "@/lib/types";
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

interface StatusCompositionChartProps {
	items: MatrixItemResult[];
}

interface CompositionRow {
	name: string;
	completed: number;
	failed: number;
	pending: number;
	running: number;
	total: number;
}

function CompositionTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: CompositionRow }>;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}

	const row = payload[0]?.payload;
	if (!row) {
		return null;
	}

	return (
		<div className="rounded border border-border bg-background-raised p-3 text-sm">
			<p className="font-semibold text-foreground">{row.name}</p>
			<p className="mt-1 text-success">Completed: {row.completed}</p>
			<p className="text-danger">Failed: {row.failed}</p>
			{row.running > 0 && <p className="text-info">Running: {row.running}</p>}
			{row.pending > 0 && <p className="text-warning">Pending: {row.pending}</p>}
			<p className="mt-1 text-foreground-muted">Total: {row.total}</p>
		</div>
	);
}

function StatusBars({ data }: { data: CompositionRow[] }) {
	if (data.length === 0) {
		return (
			<p className="py-12 text-center text-sm text-foreground-faint">
				No status breakdown is available for the current filter scope.
			</p>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={Math.max(280, data.length * 44)}>
			<BarChart
				data={data}
				layout="vertical"
				margin={{ top: 8, right: 24, bottom: 8, left: 92 }}
			>
				<CartesianGrid stroke="hsl(213, 23%, 15%)" strokeDasharray="3 3" />
				<XAxis
					type="number"
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
				<Tooltip content={<CompositionTooltip />} />
				<Legend
					wrapperStyle={{ paddingTop: 8 }}
					formatter={(value) => (
						<span className="text-xs text-foreground-muted">{value}</span>
					)}
				/>
				<Bar dataKey="completed" stackId="status" fill="hsl(156, 67%, 55%)" />
				<Bar dataKey="failed" stackId="status" fill="hsl(0, 100%, 68%)" />
				<Bar dataKey="running" stackId="status" fill="hsl(212, 100%, 67%)" />
				<Bar dataKey="pending" stackId="status" fill="hsl(43, 93%, 63%)" />
			</BarChart>
		</ResponsiveContainer>
	);
}

/**
 * Renders the status composition chart with dimension tabs.
 *
 * @param props - Chart props
 * @param props.items - Filtered leaderboard items
 * @returns React element containing reliability breakdown views
 */
export function StatusCompositionChart({
	items,
}: StatusCompositionChartProps) {
	const byModel = computeStatusBreakdown(items, groupByModel).slice(0, 10);
	const byHarness = computeStatusBreakdown(items, groupByHarness).slice(0, 10);
	const byTest = computeStatusBreakdown(items, groupByTest).slice(0, 10);

	return (
		<Card className="border-border/80 bg-card/85 backdrop-blur">
			<CardHeader>
				<CardTitle className="text-base">Reliability mix</CardTitle>
				<p className="text-sm leading-6 text-foreground-muted">
					Completion vs failure volume by dimension. This helps separate
					reasoning weakness from outright harness instability.
				</p>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="model">
					<TabsList>
						<TabsTrigger value="model">By Model</TabsTrigger>
						<TabsTrigger value="harness">By Harness</TabsTrigger>
						<TabsTrigger value="test">By Test</TabsTrigger>
					</TabsList>
					<TabsContent value="model" className="mt-4">
						<StatusBars data={byModel} />
					</TabsContent>
					<TabsContent value="harness" className="mt-4">
						<StatusBars data={byHarness} />
					</TabsContent>
					<TabsContent value="test" className="mt-4">
						<StatusBars data={byTest} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
