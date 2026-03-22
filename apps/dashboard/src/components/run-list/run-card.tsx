/**
 * Purpose: Card component for displaying a single run summary.
 * Shows runId, timestamp, duration, pass rate, and item counts.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunListItem } from "@/lib/types";
import { cn, formatDate, formatDuration, formatPercent } from "@/lib/utils";
import { Link } from "react-router-dom";

interface RunCardProps {
	run: RunListItem;
	/** Optional pass rate (0-1 scale) */
	passRate?: number;
	showCheckpointBadge?: boolean;
	accent?: "default" | "latest";
}

export function RunCard({
	run,
	passRate,
	showCheckpointBadge = true,
	accent = "default",
}: RunCardProps) {
	const {
		runId,
		startedAt,
		durationMs,
		summary,
		checkpointId,
		machineDisplayLabel,
		machineProfileLabel,
		isLegacy,
	} = run;
	const hasFailures = summary.failed > 0;
	const machineBadgeLabel =
		machineDisplayLabel?.trim() || machineProfileLabel?.trim();

	return (
		<Link to={`/runs/${runId}`}>
			<Card
				glow
				className={cn(
					"transition-colors hover:bg-accent/50",
					accent === "latest"
						? "border-l-2 border-l-success border-success/20 bg-success/5"
						: "border-l-2 border-l-border",
				)}
			>
				<CardHeader className="pb-2">
					<div className="flex items-start justify-between">
						<CardTitle className="text-sm truncate">{runId}</CardTitle>
						{hasFailures ? (
							<Badge variant="destructive" className="ml-2">
								{summary.failed} failed
							</Badge>
						) : (
							<Badge variant="success" className="ml-2">
								all pass
							</Badge>
						)}
					</div>
					<p className="text-xs text-foreground-faint">
						{formatDate(startedAt)}
					</p>
					<div className="mt-1 flex flex-wrap gap-1">
						{showCheckpointBadge &&
							(checkpointId ? (
								<Badge variant="secondary" className="text-[10px]">
									{checkpointId}
								</Badge>
							) : (
								<Badge variant="warning" className="text-[10px]">
									no-checkpoint
								</Badge>
							))}
						{machineBadgeLabel && (
							<Badge variant="secondary" className="text-[10px]">
								{machineBadgeLabel}
							</Badge>
						)}
						{isLegacy && (
							<Badge variant="warning" className="text-[10px]">
								legacy
							</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-2 text-sm">
						<div>
							<span className="text-foreground-muted">Items</span>
							<p className="font-medium">
								{summary.completed}/{summary.total}
							</p>
						</div>
						<div>
							<span className="text-foreground-muted">Duration</span>
							<p className="font-medium">{formatDuration(durationMs)}</p>
						</div>
						{passRate !== undefined && (
							<div className="col-span-2">
								<span className="text-foreground-muted">Pass Rate</span>
								<p className="font-medium">{formatPercent(passRate)}</p>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}
