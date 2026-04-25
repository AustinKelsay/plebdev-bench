/**
 * Purpose: Summary KPI cards for the leaderboard page.
 * Exports: LeaderboardSummaryCards
 *
 * Invariants:
 * - Displays aggregate-wide totals with filter-aware item and pass-rate summaries
 * - Accepts nullable aggregate payload so empty states remain renderable
 * - 6 instrument-panel cards with staggered animations and accent borders
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PassRateResult } from "@/lib/aggregations";
import type { LeaderboardAggregate, MatrixItemResult } from "@/lib/types";
import { formatDuration, formatPercent } from "@/lib/utils";

interface LeaderboardSummaryCardsProps {
	aggregate: LeaderboardAggregate | null;
	filteredItemCount: number;
	filteredItems: MatrixItemResult[];
	passRate: PassRateResult;
}

/**
 * Renders top-level leaderboard KPI cards.
 *
 * @param props - Summary card props
 * @param props.aggregate - Latest checkpoint aggregate payload, if available
 * @param props.filteredItemCount - Number of items visible after filters
 * @param props.filteredItems - Filtered items for computing derived stats
 * @param props.passRate - Pass-rate summary for the filtered aggregate items
 * @returns React element containing six KPI cards
 */
export function LeaderboardSummaryCards({
	aggregate,
	filteredItemCount,
	filteredItems,
	passRate,
}: LeaderboardSummaryCardsProps) {
	// Frontier coverage: % of items with frontier eval
	const frontierCount = filteredItems.filter((i) => i.frontierEval).length;
	const frontierCoverage =
		filteredItemCount > 0 ? frontierCount / filteredItemCount : 0;

	// Median generation duration
	const durations = filteredItems
		.map((i) => i.generation?.durationMs)
		.filter((d): d is number => d !== undefined)
		.sort((a, b) => a - b);
	const medianDuration =
		durations.length > 0
			? durations.length % 2 === 0
				? (durations[durations.length / 2 - 1] +
						durations[durations.length / 2]) /
					2
				: durations[Math.floor(durations.length / 2)]
			: null;

	const cards = [
		{
			title: "Matched Runs",
			value: String(aggregate?.summary.runsMatched ?? 0),
			sub: null,
			color: "hsl(var(--success))",
		},
		{
			title: "Profiles",
			value: String(aggregate?.summary.machines ?? 0),
			sub:
				aggregate?.summary.instances !== undefined
					? `${aggregate.summary.instances} ${
							aggregate.summary.instances === 1 ? "instance" : "instances"
						}`
					: null,
			color: "hsl(var(--success))",
		},
		{
			title: "Deduped Items",
			value: String(filteredItemCount),
			sub: `of ${aggregate?.summary.dedupedItems ?? 0} total`,
			color: "hsl(var(--primary))",
		},
		{
			title: "Pass Rate",
			value: formatPercent(passRate.passRate),
			sub: `${passRate.passed}/${passRate.total} tests`,
			color: "hsl(var(--success))",
		},
		{
			title: "Frontier Coverage",
			value: formatPercent(frontierCoverage),
			sub: `${frontierCount} of ${filteredItemCount} items`,
			color: "hsl(var(--accent))",
		},
		{
			title: "Median Duration",
			value: medianDuration !== null ? formatDuration(medianDuration) : "—",
			sub: durations.length > 0 ? `${durations.length} items` : "no data",
			color: "hsl(var(--info))",
		},
	];

	return (
		<div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
			{cards.map((card, i) => (
				<Card
					key={card.title}
					glow
					className={`border-l-2 animate-fade-slide-up animate-stagger-${i + 1}`}
					style={{ borderLeftColor: card.color }}
				>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							{card.title}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold tabular-nums">{card.value}</p>
						{card.sub && (
							<p className="text-xs text-foreground-faint">{card.sub}</p>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
