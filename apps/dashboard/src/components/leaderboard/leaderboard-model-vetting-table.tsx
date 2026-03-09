/**
 * Purpose: Model-level vetting table for ranking benchmark evidence.
 * Exports: LeaderboardModelVettingTable
 *
 * Invariants:
 * - Rows rank models only within the current filter scope
 * - Columns favor evidence, speed, and robustness over a single scalar score
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { computeModelInsights } from "@/lib/aggregations";
import type { LeaderboardAggregatedItem } from "@/lib/types";
import { formatDuration, formatPercent } from "@/lib/utils";

interface LeaderboardModelVettingTableProps {
	items: LeaderboardAggregatedItem[];
}

function getLiftVariant(lift: number | null) {
	if (lift === null) {
		return "secondary" as const;
	}
	if (lift > 0.08) {
		return "warning" as const;
	}
	if (lift < -0.02) {
		return "destructive" as const;
	}
	return "success" as const;
}

/**
 * Renders the model-level vetting table.
 *
 * @param props - Table props
 * @param props.items - Filtered leaderboard items
 * @returns React element containing ranked model evidence rows
 */
export function LeaderboardModelVettingTable({
	items,
}: LeaderboardModelVettingTableProps) {
	const insights = computeModelInsights(items);

	return (
		<Card className="border-border/80 bg-card/85 backdrop-blur">
			<CardHeader className="gap-2 pb-3">
				<CardTitle className="text-base">Model vetting board</CardTitle>
				<p className="text-sm leading-6 text-foreground-muted">
					Ranks the current slice by scored performance first, then completion
					health, frontier signal, and speed. Use this before dropping to raw
					item rows.
				</p>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-14">#</TableHead>
							<TableHead>Model</TableHead>
							<TableHead>Pass rate</TableHead>
							<TableHead>Prompt lift</TableHead>
							<TableHead>Frontier</TableHead>
							<TableHead>Completion</TableHead>
							<TableHead>Median</TableHead>
							<TableHead>Coverage</TableHead>
							<TableHead>Tooling</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{insights.map((insight, index) => (
							<TableRow key={insight.name}>
								<TableCell className="text-foreground-faint">
									{index + 1}
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">{insight.name}</p>
										<p className="text-xs text-foreground-faint">
											{insight.runtimesCovered} runtime • {insight.harnessesCovered} harnesses
										</p>
									</div>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">
											{formatPercent(insight.passRate)}
										</p>
										<p className="text-xs text-foreground-faint">
											{insight.passed}/{insight.total} scored checks
										</p>
									</div>
								</TableCell>
								<TableCell>
									<Badge variant={getLiftVariant(insight.informedLift)}>
										{insight.informedLift !== null
											? `${insight.informedLift >= 0 ? "+" : ""}${(
													insight.informedLift * 100
												).toFixed(1)}%`
											: "n/a"}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">
											{insight.frontierAvg !== null
												? `${insight.frontierAvg.toFixed(1)}/10`
												: "n/a"}
										</p>
										<p className="text-xs text-foreground-faint">
											{insight.frontierCount} evals
										</p>
									</div>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">
											{formatPercent(insight.completionRate)}
										</p>
										<p className="text-xs text-foreground-faint">
											{insight.completedItems}/{insight.totalItems} items
										</p>
									</div>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">
											{insight.medianDurationMs !== null
												? formatDuration(Math.round(insight.medianDurationMs))
												: "n/a"}
										</p>
										<p className="text-xs text-foreground-faint">
											{insight.p90DurationMs !== null
												? `p90 ${formatDuration(Math.round(insight.p90DurationMs))}`
												: "no timing"}
										</p>
									</div>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<p className="font-semibold text-foreground">
											{insight.testsCovered} tests
										</p>
										<p className="text-xs text-foreground-faint">
											{insight.totalItems} total rows in slice
										</p>
									</div>
								</TableCell>
								<TableCell>
									<Badge
										variant={
											insight.toolSuccessRate === null
												? "secondary"
												: insight.toolSuccessRate >= 0.9
													? "success"
													: insight.toolSuccessRate >= 0.6
														? "warning"
														: "destructive"
										}
									>
										{insight.toolSuccessRate !== null
											? formatPercent(insight.toolSuccessRate)
											: "n/a"}
									</Badge>
								</TableCell>
							</TableRow>
						))}
						{insights.length === 0 && (
							<TableRow>
								<TableCell colSpan={9} className="text-center text-foreground-muted">
									No model-level benchmark evidence matches the current filters.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
