/**
 * Purpose: Summary KPI cards for the leaderboard page.
 * Exports: LeaderboardSummaryCards
 *
 * Invariants:
 * - Displays aggregate-wide totals with filter-aware item and pass-rate summaries
 * - Accepts nullable aggregate payload so empty states remain renderable
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PassRateResult } from "@/lib/aggregations";
import type { LeaderboardAggregate } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface LeaderboardSummaryCardsProps {
	aggregate: LeaderboardAggregate | null;
	filteredItemCount: number;
	passRate: PassRateResult;
}

/**
 * Renders top-level leaderboard KPI cards.
 *
 * @param props - Summary card props
 * @param props.aggregate - Latest checkpoint aggregate payload, if available
 * @param props.filteredItemCount - Number of items visible after filters
 * @param props.passRate - Pass-rate summary for the filtered aggregate items
 * @returns React element containing four KPI cards
 */
export function LeaderboardSummaryCards({
	aggregate,
	filteredItemCount,
	passRate,
}: LeaderboardSummaryCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-foreground-muted">
						Matched Runs
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold tabular-nums">
						{aggregate?.summary.runsMatched ?? 0}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-foreground-muted">
						Machines
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold tabular-nums">
						{aggregate?.summary.machines ?? 0}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-foreground-muted">
						Deduped Items
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold tabular-nums">
						{filteredItemCount}
					</p>
					<p className="text-xs text-foreground-faint">
						of {aggregate?.summary.dedupedItems ?? 0} total
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-foreground-muted">
						Pass Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold tabular-nums">
						{formatPercent(passRate.passRate)}
					</p>
					<p className="text-xs text-foreground-faint">
						{passRate.passed}/{passRate.total} tests
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
