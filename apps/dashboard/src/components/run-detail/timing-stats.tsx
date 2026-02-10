/**
 * Purpose: Timing statistics component showing generation duration metrics.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeTimingStats } from "@/lib/aggregations";
import { timing as timingTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface TimingStatsProps {
	items: MatrixItemResult[];
}

export function TimingStats({ items }: TimingStatsProps) {
	const stats = computeTimingStats(items);

	if (!stats) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Timing</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm">
						No timing data available.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={timingTooltips.title}>
						Timing
					</WithInfoTooltip>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.average} side="right">
								Average
							</WithInfoTooltip>
						</span>
						<p className="text-lg font-medium tabular-nums">
							{formatDuration(stats.mean)}
						</p>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.median} side="right">
								Median
							</WithInfoTooltip>
						</span>
						<p className="text-lg font-medium tabular-nums">
							{formatDuration(stats.median)}
						</p>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.min} side="right">
								Min
							</WithInfoTooltip>
						</span>
						<p className="tabular-nums">{formatDuration(stats.min)}</p>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.max} side="right">
								Max
							</WithInfoTooltip>
						</span>
						<p className="tabular-nums">{formatDuration(stats.max)}</p>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.p90} side="right">
								p90
							</WithInfoTooltip>
						</span>
						<p className="tabular-nums">{formatDuration(stats.p90)}</p>
					</div>
					<div>
						<span className="text-foreground-muted">
							<WithInfoTooltip tooltip={timingTooltips.items} side="right">
								Items
							</WithInfoTooltip>
						</span>
						<p className="tabular-nums">{stats.count}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
