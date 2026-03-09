/**
 * Purpose: Failure breakdown stacked bar chart by model or harness.
 * Exports: FailureBreakdownChart
 *
 * Invariants:
 * - Horizontal stacked bars per model/harness showing failure type distribution
 * - Uses FAILURE_COLORS from chart-colors for consistent coloring
 * - Tabs: By Model / By Harness
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeFailureBreakdownByModel } from "@/lib/aggregations";
import { FAILURE_COLORS } from "@/lib/chart-colors";
import { failureBreakdown as failureTooltips } from "@/lib/tooltip-content";
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

interface FailureBreakdownChartProps {
	items: MatrixItemResult[];
}

const FAILURE_TYPES = [
	{ key: "timeout", label: "Timeout" },
	{ key: "import", label: "Import" },
	{ key: "missing_export", label: "Missing Export" },
	{ key: "harness_error", label: "Harness Error" },
	{ key: "factory_init_failed", label: "Factory Init" },
	{ key: "other", label: "Other" },
] as const;

function FailureTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: Array<{ name: string; value: number; color: string }>;
	label?: string;
}) {
	if (!active || !payload?.length) return null;

	const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);
	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			<p className="font-medium mb-1">{label}</p>
			{payload
				.filter((p) => p.value > 0)
				.map((p) => (
					<p key={p.name} style={{ color: p.color }}>
						{p.name}: {p.value}
					</p>
				))}
			<p className="text-foreground-muted mt-1 text-xs">Total: {total}</p>
		</div>
	);
}

function FailureBarChart({
	data,
}: {
	data: Array<{
		name: string;
		timeout: number;
		import: number;
		missing_export: number;
		harness_error: number;
		factory_init_failed: number;
		other: number;
		total: number;
	}>;
}) {
	if (data.length === 0) {
		return (
			<p className="text-foreground-faint text-sm py-8 text-center">
				No failures to display.
			</p>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
			<BarChart
				data={data}
				layout="vertical"
				margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
			>
				<CartesianGrid strokeDasharray="3 3" stroke="hsl(213, 23%, 15%)" />
				<XAxis
					type="number"
					stroke="hsl(210, 12%, 63%)"
					tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 12 }}
				/>
				<YAxis
					type="category"
					dataKey="name"
					width={90}
					stroke="hsl(210, 12%, 63%)"
					tick={{ fill: "hsl(210, 30%, 92%)", fontSize: 11 }}
				/>
				<Tooltip content={<FailureTooltip />} />
				<Legend
					wrapperStyle={{ paddingTop: "10px" }}
					formatter={(value) => (
						<span className="text-foreground-muted text-xs">{value}</span>
					)}
				/>
				{FAILURE_TYPES.map(({ key, label }) => (
					<Bar
						key={key}
						dataKey={key}
						name={label}
						stackId="failures"
						fill={FAILURE_COLORS[key] || FAILURE_COLORS.other}
						radius={0}
					/>
				))}
			</BarChart>
		</ResponsiveContainer>
	);
}

/**
 * Renders failure breakdown stacked bar chart with model/harness tabs.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Card with tabbed stacked bar views
 */
export function FailureBreakdownChart({ items }: FailureBreakdownChartProps) {
	const byModel = useMemo(
		() => computeFailureBreakdownByModel(items, "model"),
		[items],
	);
	const byHarness = useMemo(
		() => computeFailureBreakdownByModel(items, "harness"),
		[items],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={failureTooltips.title}>
						Failure Breakdown
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{failureTooltips.description}
				</p>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="model">
					<TabsList>
						<TabsTrigger value="model">By Model</TabsTrigger>
						<TabsTrigger value="harness">By Harness</TabsTrigger>
					</TabsList>
					<TabsContent value="model" className="mt-4">
						<FailureBarChart data={byModel} />
					</TabsContent>
					<TabsContent value="harness" className="mt-4">
						<FailureBarChart data={byHarness} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
