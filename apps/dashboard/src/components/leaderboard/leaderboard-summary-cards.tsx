/**
 * Purpose: Performance-focused KPI cards for the expanded leaderboard.
 * Exports: LeaderboardSummaryCards
 *
 * Invariants:
 * - Cards summarize only the current filtered scope
 * - Metrics remain directly traceable to stored run facts
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	computeCoverageStats,
	computeFrontierStats,
	computeModelInsights,
	computeTimingStats,
	computeToolUseStats,
	inferToolHarnesses,
	type PassRateResult,
} from "@/lib/aggregations";
import type { LeaderboardAggregate, LeaderboardAggregatedItem } from "@/lib/types";
import { formatDuration, formatNumber, formatPercent } from "@/lib/utils";

interface LeaderboardSummaryCardsProps {
	aggregate: LeaderboardAggregate | null;
	items: LeaderboardAggregatedItem[];
	passRate: PassRateResult;
}

interface SummaryCardDefinition {
	label: string;
	value: string;
	description: string;
	accentClassName: string;
}

/**
 * Renders the filtered leaderboard KPI ribbon.
 *
 * @param props - Summary card props
 * @param props.aggregate - Latest checkpoint aggregate metadata
 * @param props.items - Filtered leaderboard items in scope
 * @param props.passRate - Aggregate pass-rate summary for current scope
 * @returns React element containing performance KPI cards
 */
export function LeaderboardSummaryCards({
	aggregate,
	items,
	passRate,
}: LeaderboardSummaryCardsProps) {
	const coverage = computeCoverageStats(items);
	const frontierStats = computeFrontierStats(items);
	const timingStats = computeTimingStats(items);
	const toolHarnesses = inferToolHarnesses(items);
	const toolItems = items.filter((item) => toolHarnesses.has(item.harness));
	const toolStats = toolItems.length > 0 ? computeToolUseStats(toolItems) : null;
	const modelInsights = computeModelInsights(items);
	const promptLiftValues = modelInsights
		.map((insight) => insight.informedLift)
		.filter((lift): lift is number => lift !== null);
	const averagePromptLift =
		promptLiftValues.length > 0
			? promptLiftValues.reduce((sum, lift) => sum + lift, 0) /
				promptLiftValues.length
			: 0;
	const completedItems = items.filter((item) => item.status === "completed").length;
	const failedItems = items.filter((item) => item.status === "failed").length;

	const cards: SummaryCardDefinition[] = [
		{
			label: "Visible slice",
			value: formatNumber(items.length),
			description: `${formatNumber(new Set(items.map((item) => item.model)).size)} models across ${formatNumber(new Set(items.map((item) => item.test)).size)} tests`,
			accentClassName: "from-info/20 via-info/5 to-transparent",
		},
		{
			label: "Automated pass",
			value: formatPercent(passRate.passRate),
			description: `${formatNumber(passRate.passed)} of ${formatNumber(passRate.total)} scored assertions passed`,
			accentClassName: "from-success/20 via-success/5 to-transparent",
		},
		{
			label: "Completion health",
			value: formatPercent(items.length > 0 ? completedItems / items.length : 0),
			description: `${formatNumber(failedItems)} failed items inside ${formatNumber(items.length)} benchmark attempts`,
			accentClassName: "from-warning/20 via-warning/5 to-transparent",
		},
		{
			label: "Frontier read",
			value:
				frontierStats !== null
					? `${frontierStats.avgScore.toFixed(1)}/10`
					: "n/a",
			description: `${formatPercent(coverage.frontierEvalCoverage)} eval coverage in current view`,
			accentClassName: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
		},
		{
			label: "Generation speed",
			value:
				timingStats !== null ? formatDuration(Math.round(timingStats.median)) : "n/a",
			description:
				timingStats !== null
					? `p90 ${formatDuration(Math.round(timingStats.p90))}`
					: "No generation timing in scope",
			accentClassName: "from-sky-500/20 via-sky-500/5 to-transparent",
		},
		{
			label: "Prompt lift",
			value: `${averagePromptLift >= 0 ? "+" : ""}${(averagePromptLift * 100).toFixed(1)}%`,
			description:
				toolStats !== null
					? `${formatPercent(toolStats.toolSuccessRate)} tool readiness across ${formatNumber(toolStats.totalItems)} tool-expected items`
					: "No tool-expected harness data in current view",
			accentClassName: "from-amber-400/20 via-amber-400/5 to-transparent",
		},
	];

	return (
		<section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
			{cards.map((card) => (
				<Card
					key={card.label}
					className="relative overflow-hidden border-border/80 bg-card/85 backdrop-blur"
				>
					<div
						className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${card.accentClassName}`}
					/>
					<CardHeader className="relative pb-2">
						<CardTitle className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
							{card.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="relative space-y-2">
						<p className="text-3xl font-semibold tracking-tight text-foreground">
							{card.value}
						</p>
						<p className="text-sm leading-6 text-foreground-muted">
							{card.description}
						</p>
						{card.label === "Visible slice" && aggregate !== null && (
							<p className="text-xs text-foreground-faint">
								{formatNumber(aggregate.summary.dedupedItems)} deduped items in
								latest checkpoint
							</p>
						)}
					</CardContent>
				</Card>
			))}
		</section>
	);
}
