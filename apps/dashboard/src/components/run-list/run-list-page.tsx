/**
 * Purpose: Run list page component displaying all benchmark runs grouped by checkpoint season.
 * Shows the live season first, then archived seasons for auditability.
 */

import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns } from "@/hooks/use-runs";
import { formatDate, formatNumber } from "@/lib/utils";
import { Link } from "react-router-dom";
import { buildRunCheckpointGroups } from "./checkpoint-groups";
import { RunCard } from "./run-card";

const RUN_LIST_SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

/** Left-border accent color per group type. */
function groupBorderColor(group: { isLatest: boolean; isLegacy: boolean }) {
	if (group.isLatest) return "border-l-success";
	if (group.isLegacy) return "border-l-warning";
	return "border-l-foreground-faint";
}

export function RunListPage() {
	const { runs, checkpoints, latestCheckpointId, loading, error } = useRuns();
	const checkpointGroups = buildRunCheckpointGroups(
		runs,
		checkpoints,
		latestCheckpointId,
	);
	const liveGroup =
		checkpointGroups.find((group) => group.isLatest) ?? checkpointGroups[0];

	if (error) {
		return (
			<PageContainer>
				<PageHeader title="Benchmark Runs" />
				<div className="rounded border border-danger/20 bg-danger/10 p-4 text-danger">
					<p className="font-medium">Error loading runs</p>
					<p className="text-sm opacity-80">{error}</p>
				</div>
			</PageContainer>
		);
	}

	return (
		<PageContainer>
			<PageHeader
				title="Benchmark Runs"
				description={
					loading
						? "Loading..."
						: `${runs.length} runs across ${checkpointGroups.length} seasons`
				}
			/>

			{loading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{RUN_LIST_SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="h-40" />
					))}
				</div>
			) : runs.length === 0 ? (
				<div className="rounded border border-border bg-card p-8 text-center">
					<p className="text-foreground-muted">No benchmark runs found.</p>
					<p className="mt-2 text-sm text-foreground-faint">
						Run <code className="bg-muted px-1.5 py-0.5 rounded">bun pb</code>{" "}
						to create your first benchmark, then{" "}
						<code className="bg-muted px-1.5 py-0.5 rounded">
							bun dashboard:index
						</code>{" "}
						to generate the runs index.
					</p>
				</div>
			) : (
				<div className="space-y-8">
					{/* ── Hero card ── */}
					<Card className="overflow-hidden border-brand/30 bg-[linear-gradient(135deg,hsla(142,60%,49%,0.12),hsla(212,100%,67%,0.08))]" glow>
						<CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="success">live season</Badge>
									<Badge variant="outline">
										{checkpointGroups.length} seasons
									</Badge>
								</div>
								<div>
									<CardTitle className="text-xl text-foreground">
										{liveGroup?.title ?? "Published Run History"}
									</CardTitle>
									<p className="mt-2 max-w-3xl text-sm text-foreground-muted">
										Every benchmark run is published into a season — a fixed
										snapshot of prompts, specs, and scoring rubrics. The live
										season powers the leaderboard; older seasons stay here as
										audit history.
									</p>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{liveGroup?.checkpointId ? (
									<Badge variant="secondary" className="text-xs">
										{liveGroup.checkpointId}
									</Badge>
								) : null}
								<Link
									to="/leaderboard"
									className="text-sm text-info underline underline-offset-4"
								>
									open leaderboard
								</Link>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-3 md:grid-cols-4">
								{[
									{ label: "Live Runs", value: formatNumber(liveGroup?.runCount ?? 0), large: true },
									{ label: "Machines", value: formatNumber(liveGroup?.machineCount ?? 0), large: true },
									{ label: "Scored Items", value: formatNumber(liveGroup?.rawItemCount ?? 0), large: true },
									{ label: "Last Published", value: liveGroup ? formatDate(liveGroup.latestRunAt) : "n/a", large: false },
								].map((stat, i) => (
									<div
										key={stat.label}
										className={`rounded border border-white/10 bg-background/40 p-3 animate-fade-slide-up animate-stagger-${i + 1}`}
									>
										<p className="text-xs uppercase tracking-[0.16em] text-foreground-faint">
											{stat.label}
										</p>
										<p className={`mt-2 font-semibold tabular-nums ${stat.large ? "text-2xl" : "text-lg"}`}>
											{stat.value}
										</p>
									</div>
								))}
							</div>
							<div className="rounded border border-border bg-muted/20 p-3 text-sm leading-6 text-foreground-muted">
								<span className="font-medium text-foreground">What are seasons?</span>{" "}
								A season starts when benchmark definitions change (prompts, rubrics, harness code).
								Models within the same season are compared on identical ground — no moving targets.
							</div>
						</CardContent>
					</Card>

					{/* ── Checkpoint summary grid ── */}
					<div className="grid gap-3 lg:grid-cols-3">
						{checkpointGroups.map((group, i) => (
							<Card
								key={`${group.key}-summary`}
								glow
								className={`border-l-2 ${groupBorderColor(group)} animate-fade-slide-up animate-stagger-${i + 1} ${
									group.isLatest
										? "border-brand/30 bg-accent/20"
										: group.isLegacy
											? "border-warning/30"
											: ""
								}`}
							>
								<CardHeader className="pb-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={group.isLatest ? "success" : "secondary"}>
											{group.isLatest
												? "live season"
												: group.isLegacy
													? "legacy"
													: "archive"}
										</Badge>
										{group.checkpointId ? (
											<Badge variant="outline" className="text-[10px]">
												{group.checkpointId}
											</Badge>
										) : null}
									</div>
									<CardTitle className="text-base">{group.title}</CardTitle>
								</CardHeader>
								<CardContent className="grid grid-cols-3 gap-3 text-sm">
									<div>
										<p className="text-xs text-foreground-muted">Runs</p>
										<p className="font-medium tabular-nums">
											{formatNumber(group.runCount)}
										</p>
									</div>
									<div>
										<p className="text-xs text-foreground-muted">Machines</p>
										<p className="font-medium tabular-nums">
											{formatNumber(group.machineCount)}
										</p>
									</div>
									<div>
										<p className="text-xs text-foreground-muted">Published</p>
										<p className="font-medium">
											{formatDate(group.latestRunAt)}
										</p>
									</div>
								</CardContent>
							</Card>
						))}
					</div>

					{/* ── Detailed run sections ── */}
					<div className="space-y-8">
						{checkpointGroups.map((group) => (
							<section key={group.key} className="space-y-4">
								<SectionHeading
									title={group.title}
									description={
										group.isLatest
											? "Live season — these runs power the current leaderboard."
											: group.isLegacy
												? "Pre-checkpoint runs kept for auditability. Excluded from season-aware aggregation."
												: "Archived season preserved for historical comparison."
									}
								/>
								<div className="flex flex-wrap items-center gap-3 text-sm">
									<Badge
										variant={
											group.isLatest
												? "success"
												: group.isLegacy
													? "warning"
													: "secondary"
										}
									>
										{group.isLatest
											? "live"
											: group.isLegacy
												? "legacy"
												: "archive"}
									</Badge>
									{group.checkpointId ? (
										<Badge variant="outline">{group.checkpointId}</Badge>
									) : null}
									<span className="text-foreground-muted">
										{formatNumber(group.runCount)} runs · {formatNumber(group.machineCount)} machines · {formatNumber(group.rawItemCount)} items · last published {formatDate(group.latestRunAt)}
									</span>
								</div>

								<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
									{group.runs.map((run, i) => (
										<div key={run.runId} className={`animate-fade-slide-up animate-stagger-${(i % 8) + 1}`}>
											<RunCard
												run={run}
												showCheckpointBadge={false}
												accent={group.isLatest ? "latest" : "default"}
											/>
										</div>
									))}
								</div>
							</section>
						))}
					</div>
				</div>
			)}
		</PageContainer>
	);
}
