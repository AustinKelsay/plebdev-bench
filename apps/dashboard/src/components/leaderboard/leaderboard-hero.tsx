/**
 * Purpose: High-signal hero section for the leaderboard landing experience.
 * Exports: LeaderboardHero
 *
 * Invariants:
 * - Describes how benchmark artifacts become dashboard insights
 * - Uses only data already present in the current filtered leaderboard scope
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	computeLeaderboardHighlights,
	type PassRateResult,
} from "@/lib/aggregations";
import type { LeaderboardAggregate, LeaderboardAggregatedItem } from "@/lib/types";
import { formatDuration, formatNumber, formatPercent } from "@/lib/utils";
import { ArrowRight, FlaskConical, Gauge, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

interface LeaderboardHeroProps {
	aggregate: LeaderboardAggregate | null;
	items: LeaderboardAggregatedItem[];
	passRate: PassRateResult;
}

const WORKFLOW_STEPS = [
	{
		label: "Plan",
		description: "Expand runtime × harness × model × test × pass type into a reproducible matrix.",
	},
	{
		label: "Execute",
		description: "Run each item non-interactively and record generation facts, failures, and timing.",
	},
	{
		label: "Score",
		description: "Attach automated test outcomes plus optional frontier eval reasoning per item.",
	},
	{
		label: "Aggregate",
		description: "Deduplicate by checkpoint and surface the strongest comparable evidence for browsing.",
	},
] as const;

/**
 * Renders the leaderboard hero with benchmark narrative and top findings.
 *
 * @param props - Hero props
 * @param props.aggregate - Latest checkpoint aggregate metadata
 * @param props.items - Filtered leaderboard items in scope
 * @param props.passRate - Aggregate pass-rate summary for current scope
 * @returns React element for the top-of-page benchmark story
 */
export function LeaderboardHero({
	aggregate,
	items,
	passRate,
}: LeaderboardHeroProps) {
	const highlights = computeLeaderboardHighlights(items);
	const topModel = highlights.topModel;
	const fastestContender = highlights.fastestContender;
	const hardestTest = highlights.hardestTest;
	const biggestPromptLift = highlights.biggestPromptLift;

	return (
		<section className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
			<div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-info/15 blur-3xl" />
			<div className="absolute right-0 top-10 h-56 w-56 rounded-full bg-warning/10 blur-3xl" />
			<div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-success/10 blur-3xl" />

			<div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
				<div className="space-y-6">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">fact-only artifacts</Badge>
						<Badge variant="outline">deduped by checkpoint</Badge>
						<Badge variant="outline">local model benchmarking</Badge>
					</div>

					<div className="space-y-4">
						<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
							Understand how open models actually perform, not just who tops one score.
						</h1>
						<p className="max-w-3xl text-base leading-7 text-foreground-muted md:text-lg">
							This dashboard combines scored tests, frontier eval signal,
							completion health, prompt sensitivity, and latency so visitors can
							vet which models are strong, brittle, fast, or tool-fragile under
							the same reproducible benchmark matrix.
						</p>
					</div>

					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<div className="rounded-xl border border-border/70 bg-background/55 p-4">
							<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
								Checkpoint
							</p>
							<p className="mt-2 text-lg font-semibold text-foreground">
								{aggregate?.checkpointId ?? "latest"}
							</p>
						</div>
						<div className="rounded-xl border border-border/70 bg-background/55 p-4">
							<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
								Models
							</p>
							<p className="mt-2 text-lg font-semibold text-foreground">
								{formatNumber(new Set(items.map((item) => item.model)).size)}
							</p>
						</div>
						<div className="rounded-xl border border-border/70 bg-background/55 p-4">
							<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
								Items in view
							</p>
							<p className="mt-2 text-lg font-semibold text-foreground">
								{formatNumber(items.length)}
							</p>
						</div>
						<div className="rounded-xl border border-border/70 bg-background/55 p-4">
							<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
								Pass rate
							</p>
							<p className="mt-2 text-lg font-semibold text-foreground">
								{formatPercent(passRate.passRate)}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap gap-3">
						<Button asChild>
							<Link to="/about">
								How The Bench Works
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link to="/runs">Browse Raw Runs</Link>
						</Button>
					</div>

					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{WORKFLOW_STEPS.map((step, index) => (
							<div
								key={step.label}
								className="rounded-xl border border-border/60 bg-background/40 p-4"
							>
								<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
									{index + 1}. {step.label}
								</p>
								<p className="mt-2 text-sm leading-6 text-foreground-muted">
									{step.description}
								</p>
							</div>
						))}
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
					<Card className="overflow-hidden border-warning/25 bg-background/70">
						<CardContent className="space-y-3 p-5">
							<div className="flex items-center gap-3 text-warning">
								<Trophy className="h-5 w-5" />
								<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
									Strongest current slice
								</p>
							</div>
							{topModel ? (
								<>
									<p className="text-xl font-semibold text-foreground">
										{topModel.name}
									</p>
									<p className="text-sm leading-6 text-foreground-muted">
										{formatPercent(topModel.passRate)} pass rate with{" "}
										{topModel.frontierAvg !== null
											? `${topModel.frontierAvg.toFixed(1)}/10 frontier signal`
											: "no frontier eval in scope"}
										.
									</p>
								</>
							) : (
								<p className="text-sm text-foreground-muted">
									No scored items in the current filter scope.
								</p>
							)}
						</CardContent>
					</Card>

					<Card className="overflow-hidden border-info/25 bg-background/70">
						<CardContent className="space-y-3 p-5">
							<div className="flex items-center gap-3 text-info">
								<Gauge className="h-5 w-5" />
								<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
									Fastest contender
								</p>
							</div>
							{fastestContender ? (
								<>
									<p className="text-xl font-semibold text-foreground">
										{fastestContender.name}
									</p>
									<p className="text-sm leading-6 text-foreground-muted">
										Median generation{" "}
										{fastestContender.medianDurationMs !== null
											? formatDuration(
													Math.round(fastestContender.medianDurationMs),
												)
											: "n/a"}
										{" "}while staying near the current pass-rate baseline.
									</p>
								</>
							) : (
								<p className="text-sm text-foreground-muted">
									No timing data in the current filter scope.
								</p>
							)}
						</CardContent>
					</Card>

					<Card className="overflow-hidden border-danger/25 bg-background/70">
						<CardContent className="space-y-3 p-5">
							<div className="flex items-center gap-3 text-danger">
								<FlaskConical className="h-5 w-5" />
								<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
									Hardest benchmark
								</p>
							</div>
							{hardestTest ? (
								<>
									<p className="text-xl font-semibold text-foreground">
										{hardestTest.name}
									</p>
									<p className="text-sm leading-6 text-foreground-muted">
										Only {formatPercent(hardestTest.passRate)} of scored checks
										pass here ({formatNumber(hardestTest.passed)}/
										{formatNumber(hardestTest.total)}).
									</p>
								</>
							) : (
								<p className="text-sm text-foreground-muted">
									No scored tests in the current filter scope.
								</p>
							)}
						</CardContent>
					</Card>

					<Card className="overflow-hidden border-success/25 bg-background/70">
						<CardContent className="space-y-3 p-5">
							<div className="flex items-center gap-3 text-success">
								<ArrowRight className="h-5 w-5" />
								<p className="text-xs uppercase tracking-[0.22em] text-foreground-faint">
									Biggest prompt lift
								</p>
							</div>
							{biggestPromptLift ? (
								<>
									<p className="text-xl font-semibold text-foreground">
										{biggestPromptLift.name}
									</p>
									<p className="text-sm leading-6 text-foreground-muted">
										Informed prompts add{" "}
										{`${biggestPromptLift.lift >= 0 ? "+" : ""}${(
											biggestPromptLift.lift * 100
										).toFixed(1)}%`}
										{" "}vs blind on this slice.
									</p>
								</>
							) : (
								<p className="text-sm text-foreground-muted">
									Run both prompt modes to expose prompt sensitivity.
								</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}
