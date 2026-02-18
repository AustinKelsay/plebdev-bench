import { Badge } from "@/components/ui/badge";
/**
 * Purpose: Dialog showing detailed breakdown when clicking on a model/harness/test bar.
 * Exports: DimensionDetailDialog, DimensionType
 *
 * Invariants:
 * - `items` is the full run matrix; filtering is done inside the dialog
 * - Tool-smoke is excluded from pass-rate scoring summaries by default
 */
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import {
	computeBlindInformedBreakdown,
	computeCompositeMetrics,
	computeFailureStats,
	computePassRate,
	groupByHarness,
	groupByModel,
	groupByRuntime,
	groupByTest,
	inferToolHarnesses,
} from "@/lib/aggregations";
import { dimensionDetail as dimensionDetailTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { TOOL_SMOKE_TEST_SLUG } from "@/lib/types";
import { formatPercent } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

export type DimensionType = "model" | "runtime" | "harness" | "test";

interface DimensionDetailDialogProps {
	dimension: DimensionType;
	name: string | null;
	items: MatrixItemResult[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Badge labels for dimension types */
const DIMENSION_LABELS: Record<DimensionType, string> = {
	model: "Model",
	runtime: "Runtime",
	harness: "Harness",
	test: "Test",
};

/** Filters items by the selected dimension */
function filterByDimension(
	items: MatrixItemResult[],
	dimension: DimensionType,
	name: string,
): MatrixItemResult[] {
	switch (dimension) {
		case "model":
			return items.filter((i) => i.model === name);
		case "runtime":
			return items.filter((i) => i.runtime === name);
		case "harness":
			return items.filter((i) => i.harness === name);
		case "test":
			return items.filter((i) => i.test === name);
	}
}

/** Summary stats card */
function SummaryStats({ items }: { items: MatrixItemResult[] }) {
	const toolHarnesses = inferToolHarnesses(items);
	const nonToolSmoke = items.filter((i) => i.test !== TOOL_SMOKE_TEST_SLUG);
	const passRate = computePassRate(nonToolSmoke);

	const completedItems = items.filter((i) => i.status === "completed").length;
	const completionRate = items.length > 0 ? completedItems / items.length : 0;

	const toolItems = items.filter((i) => toolHarnesses.has(i.harness));
	const toolMissing = toolItems.filter((i) => {
		const failureType = i.generationFailure?.type ?? i.generation?.failureType;
		return failureType === "tool_missing";
	}).length;
	const toolSuccessRate =
		toolItems.length > 0
			? (toolItems.length - toolMissing) / toolItems.length
			: 0;

	const effectiveScore =
		passRate.passRate * 0.4 + completionRate * 0.3 + toolSuccessRate * 0.3;

	return (
		<div className="grid grid-cols-4 gap-4 text-center">
			<div className="p-3 bg-background-raised rounded border border-border">
				<p className="text-xs text-foreground-faint mb-1">
					<WithInfoTooltip
						tooltip={dimensionDetailTooltips.effective}
						side="bottom"
					>
						Effective
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums text-amber-400">
					{formatPercent(effectiveScore)}
				</p>
			</div>
			<div className="p-3 bg-background-raised rounded border border-border">
				<p className="text-xs text-foreground-faint mb-1">
					<WithInfoTooltip
						tooltip={dimensionDetailTooltips.completion}
						side="bottom"
					>
						Completion
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums">
					{completedItems}/{items.length}
				</p>
			</div>
			<div className="p-3 bg-background-raised rounded border border-border">
				<p className="text-xs text-foreground-faint mb-1">
					<WithInfoTooltip
						tooltip={dimensionDetailTooltips.passRate}
						side="bottom"
					>
						Pass Rate
					</WithInfoTooltip>
				</p>
				<p
					className={`text-lg font-bold tabular-nums ${
						passRate.passRate >= 0.8
							? "text-success"
							: passRate.passRate >= 0.5
								? "text-warning"
								: "text-danger"
					}`}
				>
					{formatPercent(passRate.passRate)}
				</p>
			</div>
			<div className="p-3 bg-background-raised rounded border border-border">
				<p className="text-xs text-foreground-faint mb-1">
					<WithInfoTooltip
						tooltip={dimensionDetailTooltips.toolSuccess}
						side="bottom"
					>
						Tool Success
					</WithInfoTooltip>
				</p>
				<p className="text-lg font-bold tabular-nums text-blue-400">
					{toolItems.length > 0 ? formatPercent(toolSuccessRate) : "—"}
				</p>
			</div>
		</div>
	);
}

/** Sub-dimension breakdown table */
function SubDimensionTable({
	items,
	groupFn,
	label,
}: {
	items: MatrixItemResult[];
	groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>;
	label: string;
}) {
	const toolHarnesses = inferToolHarnesses(items);
	const metrics = computeCompositeMetrics(items, groupFn, toolHarnesses);

	if (metrics.length === 0) return null;

	return (
		<div>
			<h4 className="text-sm font-medium text-foreground-muted mb-2">
				By {label}
			</h4>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border text-foreground-faint">
							<th className="text-left py-2 pr-4">{label}</th>
							<th className="text-right py-2 px-2">Complete</th>
							<th className="text-right py-2 px-2">Pass</th>
							<th className="text-right py-2 px-2">Tool</th>
						</tr>
					</thead>
					<tbody>
						{metrics.map((m) => (
							<tr key={m.name} className="border-b border-border/50">
								<td
									className="py-2 pr-4 font-mono text-xs truncate max-w-[150px]"
									title={m.name}
								>
									{m.name}
								</td>
								<td className="text-right py-2 px-2 tabular-nums">
									{m.completedItems}/{m.totalItems}
								</td>
								<td
									className={`text-right py-2 px-2 tabular-nums ${
										m.passRate >= 0.8
											? "text-success"
											: m.passRate >= 0.5
												? "text-warning"
												: "text-danger"
									}`}
								>
									{formatPercent(m.passRate)}
								</td>
								<td className="text-right py-2 px-2 tabular-nums text-blue-400">
									{m.toolTotal > 0 ? formatPercent(m.toolSuccessRate) : "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

/** Blind vs Informed comparison */
function BlindVsInformedSection({ items }: { items: MatrixItemResult[] }) {
	const breakdown = computeBlindInformedBreakdown(
		items,
		(i) => new Map([["all", i]]),
	);

	if (breakdown.length === 0) return null;

	const data = breakdown[0];
	if (data.blindTotal === 0 && data.informedTotal === 0) return null;

	return (
		<div>
			<h4 className="text-sm font-medium text-foreground-muted mb-2">
				Blind vs Informed
			</h4>
			<div className="grid grid-cols-3 gap-4 text-center">
				<div className="p-3 bg-background-raised rounded border border-border">
					<p className="text-xs text-foreground-faint mb-1">Blind</p>
					<p className="text-lg font-bold tabular-nums">
						{formatPercent(data.blindPassRate)}
					</p>
					<p className="text-xs text-foreground-faint">
						{data.blindPassed}/{data.blindTotal}
					</p>
				</div>
				<div className="p-3 bg-background-raised rounded border border-border">
					<p className="text-xs text-foreground-faint mb-1">Informed</p>
					<p className="text-lg font-bold tabular-nums">
						{formatPercent(data.informedPassRate)}
					</p>
					<p className="text-xs text-foreground-faint">
						{data.informedPassed}/{data.informedTotal}
					</p>
				</div>
				<div className="p-3 bg-background-raised rounded border border-border">
					<p className="text-xs text-foreground-faint mb-1">Delta</p>
					<p
						className={`text-lg font-bold tabular-nums ${
							data.delta > 0
								? "text-success"
								: data.delta < 0
									? "text-danger"
									: ""
						}`}
					>
						{data.delta > 0 ? "+" : ""}
						{formatPercent(data.delta)}
					</p>
				</div>
			</div>
		</div>
	);
}

/** Failure breakdown section */
function FailureSection({ items }: { items: MatrixItemResult[] }) {
	const stats = computeFailureStats(items);

	if (
		stats.totalGenerationFailures === 0 &&
		stats.totalScoringFailures === 0 &&
		stats.totalFrontierEvalFailures === 0
	) {
		return null;
	}

	return (
		<div>
			<h4 className="text-sm font-medium text-foreground-muted mb-2">
				Failures
			</h4>
			<div className="space-y-2">
				{stats.totalGenerationFailures > 0 && (
					<div className="p-3 bg-background-raised rounded border border-border">
						<p className="text-xs text-foreground-faint mb-1">
							Generation ({stats.totalGenerationFailures})
						</p>
						<div className="flex flex-wrap gap-1">
							{Array.from(stats.generationFailures.entries()).map(
								([type, count]) => (
									<Badge key={type} variant="destructive" className="text-xs">
										{type}: {count}
									</Badge>
								),
							)}
						</div>
					</div>
				)}
				{stats.totalScoringFailures > 0 && (
					<div className="p-3 bg-background-raised rounded border border-border">
						<p className="text-xs text-foreground-faint mb-1">
							Scoring ({stats.totalScoringFailures})
						</p>
						<div className="flex flex-wrap gap-1">
							{Array.from(stats.scoringFailures.entries()).map(
								([type, count]) => (
									<Badge
										key={type}
										variant="outline"
										className="text-xs text-warning"
									>
										{type}: {count}
									</Badge>
								),
							)}
						</div>
					</div>
				)}
				{stats.totalFrontierEvalFailures > 0 && (
					<div className="p-3 bg-background-raised rounded border border-border">
						<p className="text-xs text-foreground-faint mb-1">
							Frontier Eval ({stats.totalFrontierEvalFailures})
						</p>
						<div className="flex flex-wrap gap-1">
							{Array.from(stats.frontierEvalFailures.entries()).map(
								([type, count]) => (
									<Badge key={type} variant="outline" className="text-xs">
										{type}: {count}
									</Badge>
								),
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/** Items list table */
function ItemsList({ items }: { items: MatrixItemResult[] }) {
	// Sort by status (failed first), then by test name
	const sorted = [...items].sort((a, b) => {
		if (a.status === "failed" && b.status !== "failed") return -1;
		if (b.status === "failed" && a.status !== "failed") return 1;
		return a.test.localeCompare(b.test);
	});

	return (
		<div>
			<h4 className="text-sm font-medium text-foreground-muted mb-2">
				Items ({items.length})
			</h4>
			<div className="overflow-x-auto max-h-[200px] overflow-y-auto">
				<table className="w-full text-sm">
					<thead className="sticky top-0 bg-background">
						<tr className="border-b border-border text-foreground-faint">
							<th className="text-left py-2 pr-2">Status</th>
							<th className="text-left py-2 px-2">Test</th>
							<th className="text-left py-2 px-2">Harness</th>
							<th className="text-left py-2 px-2">Runtime</th>
							<th className="text-left py-2 px-2">Type</th>
							<th className="text-right py-2 pl-2">Score</th>
						</tr>
					</thead>
					<tbody>
						{sorted.map((item) => (
							<tr key={item.id} className="border-b border-border/50">
								<td className="py-1.5 pr-2">
									<StatusBadge status={item.status} />
								</td>
								<td
									className="py-1.5 px-2 font-mono text-xs truncate max-w-[100px]"
									title={item.test}
								>
									{item.test}
								</td>
								<td
									className="py-1.5 px-2 font-mono text-xs truncate max-w-[80px]"
									title={item.harness}
								>
									{item.harness}
								</td>
								<td
									className="py-1.5 px-2 font-mono text-xs truncate max-w-[80px]"
									title={item.runtime}
								>
									{item.runtime}
								</td>
								<td className="py-1.5 px-2">
									<Badge variant="outline" className="text-xs">
										{item.passType}
									</Badge>
								</td>
								<td className="text-right py-1.5 pl-2 tabular-nums">
									{item.automatedScore ? (
										<span
											className={
												item.automatedScore.passed === item.automatedScore.total
													? "text-success"
													: item.automatedScore.passed === 0
														? "text-danger"
														: "text-warning"
											}
										>
											{item.automatedScore.passed}/{item.automatedScore.total}
										</span>
									) : (
										<span className="text-foreground-faint">—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

/**
 * Renders a dialog with per-dimension breakdowns and item details.
 *
 * @param props - Component props
 * @returns React element or null if no `name` is selected
 */
export function DimensionDetailDialog({
	dimension,
	name,
	items,
	open,
	onOpenChange,
}: DimensionDetailDialogProps) {
	if (!name) return null;

	const filteredItems = filterByDimension(items, dimension, name);

	// Determine which sub-dimensions to show
	const subDimensions: Array<{
		groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>;
		label: string;
	}> = [];

	if (dimension !== "harness") {
		subDimensions.push({ groupFn: groupByHarness, label: "Harness" });
	}
	if (dimension !== "runtime") {
		subDimensions.push({ groupFn: groupByRuntime, label: "Runtime" });
	}
	if (dimension !== "test") {
		subDimensions.push({ groupFn: groupByTest, label: "Test" });
	}
	if (dimension !== "model") {
		subDimensions.push({ groupFn: groupByModel, label: "Model" });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Badge variant="outline">{DIMENSION_LABELS[dimension]}</Badge>
						<span className="font-mono">{name}</span>
					</DialogTitle>
					<DialogDescription>
						Detailed breakdown for this {dimension}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Summary Stats */}
					<section>
						<h4 className="text-sm font-medium text-foreground-muted mb-2">
							Summary
						</h4>
						<SummaryStats items={filteredItems} />
					</section>

					{/* Blind vs Informed */}
					<BlindVsInformedSection items={filteredItems} />

					{/* Sub-dimension breakdowns */}
					{subDimensions.map(({ groupFn, label }) => (
						<SubDimensionTable
							key={label}
							items={filteredItems}
							groupFn={groupFn}
							label={label}
						/>
					))}

					{/* Failures */}
					<FailureSection items={filteredItems} />

					{/* Items List */}
					<ItemsList items={filteredItems} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
