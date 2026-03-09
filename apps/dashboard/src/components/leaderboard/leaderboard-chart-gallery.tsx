/**
 * Purpose: Rich comparison gallery for the leaderboard landing page.
 * Exports: LeaderboardChartGallery
 *
 * Invariants:
 * - Charts always read from the already-filtered aggregate scope
 * - Layout mixes ranking, speed, reliability, and benchmark-specific views
 */

import { BenchmarkHeatmapChart } from "@/components/charts/benchmark-heatmap";
import { BlindVsInformedChart } from "@/components/charts/blind-vs-informed-chart";
import { CompositeScoreChart } from "@/components/charts/composite-score-chart";
import { FrontierEvalScatter } from "@/components/charts/frontier-eval-scatter";
import { ModelEfficiencyChart } from "@/components/charts/model-efficiency-chart";
import { PassRateChart } from "@/components/charts/pass-rate-chart";
import { PromptLiftChart } from "@/components/charts/prompt-lift-chart";
import { StatusCompositionChart } from "@/components/charts/status-composition-chart";
import { TimingDistribution } from "@/components/charts/timing-distribution";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardAggregatedItem } from "@/lib/types";

interface LeaderboardChartGalleryProps {
	items: LeaderboardAggregatedItem[];
}

/**
 * Renders the expanded leaderboard chart gallery.
 *
 * @param props - Chart gallery props
 * @param props.items - Filtered aggregate items powering all visualizations
 * @returns React element containing comparison and explainer charts
 */
export function LeaderboardChartGallery({
	items,
}: LeaderboardChartGalleryProps) {
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h2 className="text-xl font-semibold text-foreground">
						Benchmark map
					</h2>
					<p className="mt-1 max-w-3xl text-sm leading-6 text-foreground-muted">
						These views make different questions explicit: who is strongest,
						where prompt scaffolding matters, which models trade speed for
						quality, and which tests or harnesses are driving failures.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit">
					{items.length} filtered items
				</Badge>
			</div>

			<CompositeScoreChart items={items} />

			<div className="grid gap-4 xl:grid-cols-2">
				<ModelEfficiencyChart items={items} />
				<PromptLiftChart items={items} />
			</div>

			<div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
				<BenchmarkHeatmapChart items={items} />
				<StatusCompositionChart items={items} />
			</div>

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
