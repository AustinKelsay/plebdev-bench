/**
 * Purpose: Run list page component displaying all benchmark runs grouped by checkpoint.
 * Shows the live checkpoint first, then archived checkpoint seasons for auditability.
 */

import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns } from "@/hooks/use-runs";
import { formatDate, formatNumber } from "@/lib/utils";
import { Link } from "react-router-dom";
import { buildRunCheckpointGroups } from "./checkpoint-groups";
import { RunCard } from "./run-card";

const RUN_LIST_SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

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
						: `${runs.length} runs across ${checkpointGroups.length} published checkpoint groups`
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
					<Card className="overflow-hidden border-brand/30 bg-[linear-gradient(135deg,hsla(142,60%,49%,0.12),hsla(212,100%,67%,0.08))]">
						<CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="success">live checkpoint</Badge>
									<Badge variant="outline">
										{checkpointGroups.length} checkpoint groups
									</Badge>
								</div>
								<div>
									<CardTitle className="text-xl text-foreground">
										{liveGroup?.title ?? "Published Run History"}
									</CardTitle>
									<p className="mt-2 max-w-3xl text-sm text-foreground-muted">
										Runs are published in checkpointed seasons. The latest
										checkpoint powers the live leaderboard, while older
										checkpoints stay here as audit history.
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
						<CardContent className="grid gap-3 md:grid-cols-4">
							<div className="rounded border border-white/10 bg-background/40 p-3">
								<p className="text-xs uppercase tracking-[0.16em] text-foreground-faint">
									Live Runs
								</p>
								<p className="mt-2 text-2xl font-semibold tabular-nums">
									{formatNumber(liveGroup?.runCount ?? 0)}
								</p>
							</div>
							<div className="rounded border border-white/10 bg-background/40 p-3">
								<p className="text-xs uppercase tracking-[0.16em] text-foreground-faint">
									Machines
								</p>
								<p className="mt-2 text-2xl font-semibold tabular-nums">
									{formatNumber(liveGroup?.machineCount ?? 0)}
								</p>
							</div>
							<div className="rounded border border-white/10 bg-background/40 p-3">
								<p className="text-xs uppercase tracking-[0.16em] text-foreground-faint">
									Scored Items
								</p>
								<p className="mt-2 text-2xl font-semibold tabular-nums">
									{formatNumber(liveGroup?.rawItemCount ?? 0)}
								</p>
							</div>
							<div className="rounded border border-white/10 bg-background/40 p-3">
								<p className="text-xs uppercase tracking-[0.16em] text-foreground-faint">
									Last Published
								</p>
								<p className="mt-2 text-lg font-semibold">
									{liveGroup ? formatDate(liveGroup.latestRunAt) : "n/a"}
								</p>
							</div>
						</CardContent>
					</Card>

					<div className="grid gap-3 lg:grid-cols-3">
						{checkpointGroups.map((group) => (
							<Card
								key={`${group.key}-summary`}
								className={
									group.isLatest
										? "border-brand/30 bg-accent/20"
										: group.isLegacy
											? "border-warning/30"
											: undefined
								}
							>
								<CardHeader className="pb-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={group.isLatest ? "success" : "secondary"}>
											{group.isLatest
												? "current season"
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

					<div className="space-y-8">
						{checkpointGroups.map((group) => (
							<section key={group.key} className="space-y-4">
								<div className="flex flex-col gap-3 rounded border border-border bg-card/60 p-4 lg:flex-row lg:items-end lg:justify-between">
									<div>
										<div className="flex flex-wrap items-center gap-2">
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
													? "latest checkpoint"
													: group.isLegacy
														? "legacy / missing checkpoint"
														: "past checkpoint"}
											</Badge>
											{group.checkpointId ? (
												<Badge variant="outline">{group.checkpointId}</Badge>
											) : null}
										</div>
										<h2 className="mt-3 text-xl font-semibold text-foreground">
											{group.title}
										</h2>
										<p className="mt-1 text-sm text-foreground-muted">
											{group.isLatest
												? "These runs define the current published season and power the live leaderboard."
												: group.isLegacy
													? "Older runs without full checkpoint metadata stay visible for auditability, but they are excluded from checkpoint-aware leaderboard aggregation."
													: "Archived checkpoint season kept visible for historical comparison and auditing."}
										</p>
									</div>
									<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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
											<p className="text-xs text-foreground-muted">Items</p>
											<p className="font-medium tabular-nums">
												{formatNumber(group.rawItemCount)}
											</p>
										</div>
										<div>
											<p className="text-xs text-foreground-muted">
												Last Published
											</p>
											<p className="font-medium">
												{formatDate(group.latestRunAt)}
											</p>
										</div>
									</div>
								</div>

								<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
									{group.runs.map((run) => (
										<RunCard
											key={run.runId}
											run={run}
											showCheckpointBadge={false}
											accent={group.isLatest ? "latest" : "default"}
										/>
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
