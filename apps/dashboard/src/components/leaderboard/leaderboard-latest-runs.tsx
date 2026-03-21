/**
 * Purpose: Latest published run cards embedded on the leaderboard page.
 * Exports: LeaderboardLatestRuns
 *
 * Invariants:
 * - Shows newest runs from the generated dashboard index
 * - Labels whether each run currently contributes to the latest-checkpoint leaderboard
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunListItem } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/utils";
import { Link } from "react-router-dom";

const MAX_LATEST_RUNS = 6;

interface LeaderboardLatestRunsProps {
	runs: RunListItem[];
	latestCheckpointId: string | null;
}

function getRunAggregateBadge(
	run: RunListItem,
	latestCheckpointId: string | null,
): { label: string; variant: "secondary" | "success" | "warning" } {
	if (run.isLegacy) {
		return { label: "legacy", variant: "warning" };
	}
	if (!latestCheckpointId || !run.checkpointId) {
		return { label: "unscoped", variant: "secondary" };
	}
	if (run.checkpointId === latestCheckpointId) {
		return { label: "in leaderboard", variant: "success" };
	}
	return { label: "older checkpoint", variant: "warning" };
}

/**
 * Renders the latest published runs section on the leaderboard page.
 *
 * @param props - Latest-runs props
 * @param props.runs - Newest runs from the dashboard index
 * @param props.latestCheckpointId - Checkpoint currently powering the leaderboard
 * @returns React element containing a latest-runs grid or empty state
 */
export function LeaderboardLatestRuns({
	runs,
	latestCheckpointId,
}: LeaderboardLatestRunsProps) {
	const latestRuns = runs.slice(0, MAX_LATEST_RUNS);

	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold text-foreground">Latest Runs</h2>
				<p className="mt-1 text-sm text-foreground-muted">
					Newest published runs, with whether they currently roll into the live
					leaderboard aggregate.
				</p>
			</div>

			{latestRuns.length === 0 ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-foreground-muted">
						No published runs found.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{latestRuns.map((run) => {
						const aggregateBadge = getRunAggregateBadge(run, latestCheckpointId);
						const hasFailures = run.summary.failed > 0;

						return (
							<Link key={run.runId} to={`/runs/${run.runId}`}>
								<Card className="h-full transition-colors hover:bg-accent/50">
									<CardHeader className="space-y-3 pb-3">
										<div className="flex items-start justify-between gap-3">
											<CardTitle className="text-sm leading-6">
												{run.runId}
											</CardTitle>
											<Badge variant={aggregateBadge.variant}>
												{aggregateBadge.label}
											</Badge>
										</div>
										<p className="text-xs text-foreground-faint">
											{formatDate(run.startedAt)}
										</p>
										<div className="flex flex-wrap gap-2">
											{run.checkpointId ? (
												<Badge variant="secondary">{run.checkpointId}</Badge>
											) : (
												<Badge variant="warning">no-checkpoint</Badge>
											)}
											{run.machineDisplayLabel || run.machineProfileLabel ? (
												<Badge variant="outline">
													{run.machineDisplayLabel ?? run.machineProfileLabel}
												</Badge>
											) : null}
										</div>
									</CardHeader>
									<CardContent className="grid grid-cols-2 gap-3 text-sm">
										<div>
											<p className="text-xs text-foreground-muted">Items</p>
											<p className="font-medium tabular-nums">
												{run.summary.completed}/{run.summary.total}
											</p>
										</div>
										<div>
											<p className="text-xs text-foreground-muted">Duration</p>
											<p className="font-medium">{formatDuration(run.durationMs)}</p>
										</div>
										<div className="col-span-2">
											<Badge variant={hasFailures ? "destructive" : "success"}>
												{hasFailures
													? `${run.summary.failed} failed items`
													: "all items completed"}
											</Badge>
										</div>
									</CardContent>
								</Card>
							</Link>
						);
					})}
				</div>
			)}
		</section>
	);
}
