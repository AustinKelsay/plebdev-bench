/**
 * Purpose: Lead chart section for the leaderboard page.
 * Exports: LeaderboardChartGallery
 *
 * Invariants:
 * - Renders aggregate charts before filter/table sections
 * - Uses filtered aggregate items so charts stay aligned with visible leaderboard scope
 */

import { BlindVsInformedChart } from "@/components/charts/blind-vs-informed-chart";
import { CompositeScoreChart } from "@/components/charts/composite-score-chart";
import { FrontierEvalScatter } from "@/components/charts/frontier-eval-scatter";
import { PassRateChart } from "@/components/charts/pass-rate-chart";
import { TimingDistribution } from "@/components/charts/timing-distribution";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardAggregatedItem } from "@/lib/types";

interface LeaderboardChartGalleryProps {
	items: LeaderboardAggregatedItem[];
}

/**
 * Renders the aggregate chart gallery for leaderboard analysis.
 *
 * @param props - Chart gallery props
 * @param props.items - Filtered aggregate items powering all visualizations
 * @returns React element containing the chart-first leaderboard section
 */
export function LeaderboardChartGallery({
	items,
}: LeaderboardChartGalleryProps) {
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h2 className="text-xl font-semibold text-foreground">
						Aggregate Charts
					</h2>
					<p className="mt-1 text-sm text-foreground-muted">
						The leaderboard now opens on the aggregate signal: rank, prompt
						delta, timing, frontier alignment, and pass-rate breakdowns across
						the latest checkpoint.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit">
					{items.length} filtered items
				</Badge>
			</div>

			<CompositeScoreChart items={items} />

			<div className="grid gap-4 xl:grid-cols-2">
				<PassRateChart items={items} />
				<BlindVsInformedChart items={items} />
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<TimingDistribution items={items} />
				<FrontierEvalScatter items={items} />
			</div>
		</section>
	);
}
