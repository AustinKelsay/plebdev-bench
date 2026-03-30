/**
 * Purpose: Run detail page component displaying a single run's results.
 * Shows summary, matrix table, scoring breakdown, and timing stats.
 * Exports: RunDetailPage, RunDetailPageSkeleton
 *
 * Invariants:
 * - `run` and `plan` conform to the dashboard result/plan schemas.
 * - `run` and `plan` represent the same benchmark run context.
 * - Must render within a router provider so `Link` can resolve navigation.
 */
import { BlindVsInformedChart } from "@/components/charts/blind-vs-informed-chart";
import { CompositeScoreChart } from "@/components/charts/composite-score-chart";
import { FrontierEvalScatter } from "@/components/charts/frontier-eval-scatter";
import { TimingDistribution } from "@/components/charts/timing-distribution";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeFrontierStats, computePassRate } from "@/lib/aggregations";
import { summary as summaryTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult, RunPlan, RunResult } from "@/lib/types";
import { formatDate, formatDuration, formatPercent } from "@/lib/utils";
import { useState } from "react";
import { CoverageDiagnostics } from "./coverage-diagnostics";
import {
	DimensionDetailDialog,
	type DimensionType,
} from "./dimension-detail-dialog";
import { FailureBreakdown } from "./failure-breakdown";
import { ItemDetailDialog } from "./item-detail-dialog";
import { MatrixTable } from "./matrix-table";
import { ModelOverviewTab } from "./model-overview-tab";
import { ScoringBreakdown } from "./scoring-breakdown";
import { TimingStats } from "./timing-stats";
import { ToolingBreakdown } from "./tooling-breakdown";

interface RunDetailPageProps {
	run: RunResult;
	plan: RunPlan;
}

/**
 * Renders the run detail page with summary metrics, charts, and item-level drill-down.
 *
 * @param props - Component props (see `RunDetailPageProps`).
 * @param props.run - The resolved run result containing summary and matrix items.
 * @param props.plan - The run plan/environment snapshot associated with `run`.
 * @returns React element containing the full run detail layout.
 * @throws none
 */
export function RunDetailPage({ run, plan }: RunDetailPageProps) {
	const [selectedItem, setSelectedItem] = useState<MatrixItemResult | null>(
		null,
	);
	const [selectedDimension, setSelectedDimension] = useState<{
		dimension: DimensionType;
		name: string;
	} | null>(null);
	const readNonEmptyLabel = (value: string | undefined): string | undefined => {
		if (typeof value !== "string") {
			return undefined;
		}
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	};

	const passRate = computePassRate(run.items);
	const frontierStats = computeFrontierStats(run.items);
	const runtimeEnvironment = plan.runtimeEnvironment ?? plan.environment;
	const runtimeEnvironmentSummary = [
		runtimeEnvironment?.platform,
		runtimeEnvironment?.bunVersion
			? `Bun ${runtimeEnvironment.bunVersion}`
			: undefined,
	]
		.filter(
			(part): part is string => typeof part === "string" && part.length > 0,
		)
		.join(" · ");
	const machineLabel =
		readNonEmptyLabel(plan.machine?.displayLabel) ??
		readNonEmptyLabel(plan.machine?.profileLabel) ??
		plan.machine?.profileKey;
	const machineHardware = plan.machine?.observedHardware;
	const checkpointId = plan.benchmarkCheckpoint?.checkpointId;

	return (
		<PageContainer>
			<PageHeader
				title={run.runId}
				description={`${formatDate(run.startedAt)} · ${formatDuration(run.durationMs)}`}
			/>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card className="border-l-2 border-l-success">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							<WithInfoTooltip tooltip={summaryTooltips.items}>
								Items
							</WithInfoTooltip>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold tabular-nums">
							{run.summary.completed}
							<span className="text-foreground-faint">
								/{run.summary.total}
							</span>
						</div>
						{run.summary.failed > 0 && (
							<Badge variant="destructive" className="mt-1">
								{run.summary.failed} failed
							</Badge>
						)}
					</CardContent>
				</Card>

				<Card className="border-l-2 border-l-info">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							<WithInfoTooltip tooltip={summaryTooltips.passRate}>
								Pass Rate
							</WithInfoTooltip>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className={`text-2xl font-bold tabular-nums ${
								passRate.passRate >= 0.8
									? "text-success"
									: passRate.passRate >= 0.5
										? "text-warning"
										: "text-danger"
							}`}
						>
							{formatPercent(passRate.passRate)}
						</div>
						<p className="text-sm text-foreground-faint">
							{passRate.passed}/{passRate.total} tests
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-2 border-l-warning">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							<WithInfoTooltip tooltip={summaryTooltips.frontierEval}>
								Frontier Eval
							</WithInfoTooltip>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{frontierStats ? (
							<>
								<div
									className={`text-2xl font-bold tabular-nums ${
										frontierStats.avgScore >= 7
											? "text-success"
											: frontierStats.avgScore >= 4
												? "text-warning"
												: "text-danger"
									}`}
								>
									{frontierStats.avgScore.toFixed(1)}
									<span className="text-foreground-faint">/10</span>
								</div>
								<p className="text-sm text-foreground-faint">
									avg ({frontierStats.count} items)
								</p>
							</>
						) : (
							<p className="text-foreground-faint">—</p>
						)}
					</CardContent>
				</Card>

				<Card className="border-l-2 border-l-foreground-faint">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							<WithInfoTooltip tooltip={summaryTooltips.environment}>
								Environment
							</WithInfoTooltip>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm">
							{machineLabel ??
								runtimeEnvironment?.platform ??
								"unknown-machine"}
						</p>
						{runtimeEnvironmentSummary.length > 0 && (
							<p className="text-sm text-foreground-faint">
								{runtimeEnvironmentSummary}
							</p>
						)}
						{machineHardware && (
							<p className="text-xs text-foreground-faint mt-1">
								{machineHardware.arch} · {machineHardware.logicalCores} cores
							</p>
						)}
						{checkpointId && (
							<p
								className="text-xs text-foreground-faint mt-1 truncate"
								title={checkpointId}
							>
								{checkpointId}
							</p>
						)}
						<p className="text-xs text-foreground-faint mt-1">
							{plan.summary.runtimes} runtimes · {plan.summary.harnesses}{" "}
							harnesses · {plan.summary.tests} tests
						</p>
					</CardContent>
				</Card>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="model">Model View</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="mt-4 space-y-6">
					{/* Primary Chart - Composite Scores */}
					<CompositeScoreChart
						items={run.items}
						onDimensionClick={(dim, name) =>
							setSelectedDimension({ dimension: dim, name })
						}
					/>

					{/* Comparison Charts */}
					<div className="grid gap-4 lg:grid-cols-2">
						<BlindVsInformedChart items={run.items} />
						<TimingDistribution items={run.items} />
					</div>

					{/* Breakdowns */}
					<div className="grid gap-4 md:grid-cols-2">
						<ScoringBreakdown items={run.items} />
						<ToolingBreakdown items={run.items} />
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<TimingStats items={run.items} />
						<FailureBreakdown items={run.items} />
					</div>

					<FrontierEvalScatter items={run.items} />

					<CoverageDiagnostics run={run} plan={plan} />

					{/* Matrix Table */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Results Matrix</CardTitle>
						</CardHeader>
						<CardContent>
							<MatrixTable items={run.items} onRowClick={setSelectedItem} />
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="model" className="mt-4">
					<ModelOverviewTab items={run.items} onItemClick={setSelectedItem} />
				</TabsContent>
			</Tabs>

			{/* Item Detail Dialog */}
			<ItemDetailDialog
				item={selectedItem}
				open={selectedItem !== null}
				onOpenChange={(open) => !open && setSelectedItem(null)}
			/>

			{/* Dimension Detail Dialog */}
			<DimensionDetailDialog
				dimension={selectedDimension?.dimension ?? "model"}
				name={selectedDimension?.name ?? null}
				items={run.items}
				open={selectedDimension !== null}
				onOpenChange={(open) => !open && setSelectedDimension(null)}
			/>
		</PageContainer>
	);
}

/**
 * Renders a loading-state skeleton for the run detail page layout.
 *
 * @returns React element that mirrors the run detail structure while data is loading.
 * @throws none
 */
export function RunDetailPageSkeleton() {
	const skeletonKeys = ["s1", "s2", "s3", "s4"] as const;

	return (
		<PageContainer>
			<Skeleton className="h-8 w-64" />
			<div className="grid gap-4 md:grid-cols-4">
				{skeletonKeys.map((key) => (
					<Skeleton key={key} className="h-24" />
				))}
			</div>
			<Skeleton className="h-96" />
		</PageContainer>
	);
}
