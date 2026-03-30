/**
 * Purpose: Lead chart section for the leaderboard page.
 * Exports: LeaderboardChartGallery
 *
 * Invariants:
 * - Renders aggregate charts before filter/table sections
 * - Uses filtered aggregate items so charts stay aligned with visible leaderboard scope
 * - Hierarchy: composite → test-type split → heatmap → pass+blind → radar+token → failure+difficulty → timing+frontier → head-to-head
 */

import { BlindVsInformedChart } from "@/components/charts/blind-vs-informed-chart";
import { CompositeScoreChart } from "@/components/charts/composite-score-chart";
import { FailureBreakdownChart } from "@/components/charts/failure-breakdown-chart";
import { FrontierEvalScatter } from "@/components/charts/frontier-eval-scatter";
import { ModelComparisonChart } from "@/components/charts/model-comparison-chart";
import { ModelRadarChart } from "@/components/charts/model-radar-chart";
import { ModelTestHeatmap } from "@/components/charts/model-test-heatmap";
import { PassRateChart } from "@/components/charts/pass-rate-chart";
import { TestDifficultyChart } from "@/components/charts/test-difficulty-chart";
import { TestTypeSplitChart } from "@/components/charts/test-type-split-chart";
import { TimingDistribution } from "@/components/charts/timing-distribution";
import { TokenEfficiencyChart } from "@/components/charts/token-efficiency-chart";
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
						Aggregate signals for the latest checkpoint: model rankings, prompt
						delta, timing, frontier alignment, and pass-rate breakdowns.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit">
					{items.length} filtered items
				</Badge>
			</div>

			{/* 1. Composite Score — primary ranking: which model is best */}
			<CompositeScoreChart items={items} />

			{/* 2. Test Type Split — category specialization view */}
			<TestTypeSplitChart items={items} />

			{/* 3. Model x Test Heatmap — per-test breakdown after rank context */}
			<ModelTestHeatmap items={items} />

			{/* 4. Core metrics: Pass Rate + Blind vs Informed */}
			<div className="grid gap-4 xl:grid-cols-2">
				<PassRateChart items={items} />
				<BlindVsInformedChart items={items} />
			</div>

			{/* 5. Comparison: Radar + Token Efficiency */}
			<div className="grid gap-4 xl:grid-cols-2">
				<ModelRadarChart items={items} />
				<TokenEfficiencyChart items={items} />
			</div>

			{/* 6. Diagnostics: Failure Breakdown + Test Difficulty */}
			<div className="grid gap-4 xl:grid-cols-2">
				<FailureBreakdownChart items={items} />
				<TestDifficultyChart items={items} />
			</div>

			{/* 7. Supplementary: Timing + Frontier Scatter */}
			<div className="grid gap-4 xl:grid-cols-2">
				<TimingDistribution items={items} />
				<FrontierEvalScatter items={items} />
			</div>

			{/* 8. Interactive exploration: Head-to-Head Comparison */}
			<ModelComparisonChart items={items} />
		</section>
	);
}
