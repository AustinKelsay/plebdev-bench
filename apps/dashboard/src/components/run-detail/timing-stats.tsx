/**
 * Purpose: Timing statistics component showing generation duration metrics.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import {
	type GroupTimingStats,
	computeScoringTimingBreakdown,
	computeScoringTimingStats,
	computeTimingStats,
	groupByHarness,
	groupByModel,
	groupByRuntime,
} from "@/lib/aggregations";
import { timing as timingTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface TimingStatsProps {
	items: MatrixItemResult[];
}

interface TimingGridTooltipCopy {
	average: string;
	median: string;
	min: string;
	max: string;
	p90: string;
	items: string;
}

const NEUTRAL_TIMING_TOOLTIP = "Timing information for this stage.";
const DEFAULT_TIMING_GRID_TOOLTIP_COPY: TimingGridTooltipCopy = {
	average: NEUTRAL_TIMING_TOOLTIP,
	median: NEUTRAL_TIMING_TOOLTIP,
	min: NEUTRAL_TIMING_TOOLTIP,
	max: NEUTRAL_TIMING_TOOLTIP,
	p90: NEUTRAL_TIMING_TOOLTIP,
	items: NEUTRAL_TIMING_TOOLTIP,
};

const GENERATION_TIMING_TOOLTIP_COPY: TimingGridTooltipCopy = {
	average: timingTooltips.average,
	median: timingTooltips.median,
	min: timingTooltips.min,
	max: timingTooltips.max,
	p90: timingTooltips.p90,
	items: timingTooltips.items,
};

const SCORING_TIMING_TOOLTIP_COPY: TimingGridTooltipCopy = {
	average: "Mean scoring time across items that produced scoring metrics.",
	median: "Middle scoring duration (p50) across scored items.",
	min: "Fastest scoring duration observed.",
	max: "Slowest scoring duration observed.",
	p90: "90th percentile scoring duration.",
	items: "Number of items with scoring duration metrics.",
};

function TimingGrid({
	label,
	stats,
	tooltipCopy = DEFAULT_TIMING_GRID_TOOLTIP_COPY,
}: {
	label: string;
	stats: {
		mean: number;
		median: number;
		min: number;
		max: number;
		p90: number;
		count: number;
	};
	tooltipCopy?: TimingGridTooltipCopy;
}) {
	return (
		<div>
			<h4 className="text-sm text-foreground-muted mb-2">{label}</h4>
			<div className="grid grid-cols-2 gap-4 text-sm">
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.average} side="right">
							Average
						</WithInfoTooltip>
					</span>
					<p className="text-lg font-medium tabular-nums">
						{formatDuration(stats.mean)}
					</p>
				</div>
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.median} side="right">
							Median
						</WithInfoTooltip>
					</span>
					<p className="text-lg font-medium tabular-nums">
						{formatDuration(stats.median)}
					</p>
				</div>
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.min} side="right">
							Min
						</WithInfoTooltip>
					</span>
					<p className="tabular-nums">{formatDuration(stats.min)}</p>
				</div>
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.max} side="right">
							Max
						</WithInfoTooltip>
					</span>
					<p className="tabular-nums">{formatDuration(stats.max)}</p>
				</div>
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.p90} side="right">
							p90
						</WithInfoTooltip>
					</span>
					<p className="tabular-nums">{formatDuration(stats.p90)}</p>
				</div>
				<div>
					<span className="text-foreground-muted">
						<WithInfoTooltip tooltip={tooltipCopy.items} side="right">
							Items
						</WithInfoTooltip>
					</span>
					<p className="tabular-nums">{stats.count}</p>
				</div>
			</div>
		</div>
	);
}

function ScoringBreakdownTable({
	title,
	rows,
}: {
	title: string;
	rows: GroupTimingStats[];
}) {
	if (rows.length === 0) {
		return (
			<div>
				<h5 className="text-xs text-foreground-faint mb-1">{title}</h5>
				<p className="text-xs text-foreground-faint">No scoring timing data.</p>
			</div>
		);
	}

	return (
		<div>
			<h5 className="text-xs text-foreground-faint mb-1">{title}</h5>
			<div className="max-h-[220px] overflow-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b border-border text-foreground-faint">
							<th className="text-left py-1 pr-2">NAME</th>
							<th className="text-right py-1 px-2">COUNT</th>
							<th className="text-right py-1 px-2">AVG</th>
							<th className="text-right py-1 pl-2">P90</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.name} className="border-b border-border/50">
								<td
									className="py-1 pr-2 truncate max-w-[150px]"
									title={row.name}
								>
									{row.name}
								</td>
								<td className="text-right py-1 px-2 tabular-nums">
									{row.stats.count}
								</td>
								<td className="text-right py-1 px-2 tabular-nums">
									{formatDuration(row.stats.mean)}
								</td>
								<td className="text-right py-1 pl-2 tabular-nums">
									{formatDuration(row.stats.p90)}
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
 * Renders generation and scoring timing summaries for a run.
 *
 * @param props - Component props typed as TimingStatsProps.
 * `props.items` is the matrix-item list whose generation/scoring durations are aggregated.
 * @returns React element displaying timing cards, or an empty-state timing card when data is unavailable.
 */
export function TimingStats({ items }: TimingStatsProps) {
	const generationStats = computeTimingStats(items);
	const scoringStats = computeScoringTimingStats(items);
	const scoringByRuntime = computeScoringTimingBreakdown(items, groupByRuntime);
	const scoringByHarness = computeScoringTimingBreakdown(items, groupByHarness);
	const scoringByModel = computeScoringTimingBreakdown(items, groupByModel);

	if (!generationStats && !scoringStats) {
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
			<CardContent className="space-y-6">
				{generationStats && (
					<TimingGrid
						label="Generation Time"
						stats={generationStats}
						tooltipCopy={GENERATION_TIMING_TOOLTIP_COPY}
					/>
				)}

				{scoringStats && (
					<div className="space-y-3">
						<TimingGrid
							label="Scoring Time"
							stats={scoringStats}
							tooltipCopy={SCORING_TIMING_TOOLTIP_COPY}
						/>
						<div className="grid gap-4 xl:grid-cols-3">
							<ScoringBreakdownTable
								title="By Runtime"
								rows={scoringByRuntime}
							/>
							<ScoringBreakdownTable
								title="By Harness"
								rows={scoringByHarness}
							/>
							<ScoringBreakdownTable title="By Model" rows={scoringByModel} />
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
