/**
 * Purpose: Latest-checkpoint leaderboard view aggregating deduped items across runs.
 * Exports: LeaderboardPage
 *
 * Invariants:
 * - Renders only aggregate payload from `/results/aggregates/latest.json`
 * - Aggregation is precomputed using machine+matrix-key latest-wins semantics
 */

import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { computePassRate } from "@/lib/aggregations";
import { fetchDashboardIndex, fetchLatestAggregate } from "@/lib/api";
import type { DashboardIndex, LeaderboardAggregate } from "@/lib/types";
import { formatDate, formatDuration, formatPercent } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	ALL_FILTER_VALUE,
	type FilterState,
	buildMachineFilterOptions,
	createDefaultFilterState,
	filterItems,
	uniqueValues,
} from "./leaderboard-filters";

/**
 * Renders the latest-checkpoint leaderboard page.
 *
 * @returns JSX element showing aggregated benchmark rankings and filters
 * @throws {Error} Does not throw directly; surfaced fetch/render errors are shown via local error state
 */
export function LeaderboardPage() {
	const [index, setIndex] = useState<DashboardIndex | null>(null);
	const [aggregate, setAggregate] = useState<LeaderboardAggregate | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<FilterState>(
		createDefaultFilterState(),
	);

	useEffect(() => {
		const controller = new AbortController();
		const fetchData = async () => {
			setLoading(true);
			setError(null);
			try {
				const [dashboardIndex, latestAggregate] = await Promise.all([
					fetchDashboardIndex({ signal: controller.signal }),
					fetchLatestAggregate({ signal: controller.signal }),
				]);
				if (controller.signal.aborted) {
					return;
				}
				setIndex(dashboardIndex);
				setAggregate(latestAggregate);
			} catch (fetchError) {
				if (controller.signal.aborted) {
					return;
				}
				setError(
					fetchError instanceof Error
						? fetchError.message
						: "Failed to load leaderboard",
				);
				setIndex(null);
				setAggregate(null);
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		};

		void fetchData();
		return () => {
			controller.abort();
		};
	}, []);

	const items = aggregate?.items ?? [];
	const filteredItems = useMemo(
		() => filterItems(items, filters),
		[items, filters],
	);
	const passRate = useMemo(
		() => computePassRate(filteredItems),
		[filteredItems],
	);

	const machineOptions = useMemo(
		() => buildMachineFilterOptions(items),
		[items],
	);
	const runtimeOptions = useMemo(
		() => uniqueValues(items, (item) => item.runtime),
		[items],
	);
	const harnessOptions = useMemo(
		() => uniqueValues(items, (item) => item.harness),
		[items],
	);
	const passTypeOptions = useMemo(
		() => uniqueValues(items, (item) => item.passType),
		[items],
	);
	const testOptions = useMemo(
		() => uniqueValues(items, (item) => item.test),
		[items],
	);

	if (loading) {
		return (
			<PageContainer>
				<Skeleton className="h-10 w-72" />
				<div className="grid gap-4 md:grid-cols-4">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
				<Skeleton className="h-80" />
			</PageContainer>
		);
	}

	if (error) {
		return (
			<PageContainer>
				<PageHeader title="Leaderboard" />
				<div className="rounded border border-danger/20 bg-danger/10 p-4 text-danger">
					<p className="font-medium">Error loading leaderboard</p>
					<p className="text-sm opacity-80">{error}</p>
				</div>
			</PageContainer>
		);
	}

	return (
		<PageContainer>
			<PageHeader
				title="Leaderboard"
				description={
					aggregate
						? `Latest checkpoint: ${aggregate.checkpointId}`
						: "Latest checkpoint aggregate"
				}
			/>

			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							Matched Runs
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold tabular-nums">
							{aggregate?.summary.runsMatched ?? 0}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							Machines
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold tabular-nums">
							{aggregate?.summary.machines ?? 0}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							Deduped Items
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold tabular-nums">
							{filteredItems.length}
						</p>
						<p className="text-xs text-foreground-faint">
							of {aggregate?.summary.dedupedItems ?? 0} total
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground-muted">
							Pass Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold tabular-nums">
							{formatPercent(passRate.passRate)}
						</p>
						<p className="text-xs text-foreground-faint">
							{passRate.passed}/{passRate.total} tests
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 md:grid-cols-5">
						<Select
							value={filters.machine}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, machine: value }))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Machine" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All machines</SelectItem>
								{machineOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.runtime}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, runtime: value }))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Runtime" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All runtimes</SelectItem>
								{runtimeOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.harness}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, harness: value }))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Harness" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All harnesses</SelectItem>
								{harnessOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.passType}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, passType: value }))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Pass Type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All pass types</SelectItem>
								{passTypeOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.test}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, test: value }))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Test" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All tests</SelectItem>
								{testOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>

			{(aggregate?.summary.runsMatched ?? 0) === 0 &&
				(index?.runs.length ?? 0) > 0 && (
					<div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
						No published runs match latest checkpoint{" "}
						{index?.latestCheckpointId} yet.
					</div>
				)}

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Aggregated Results</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Machine</TableHead>
								<TableHead>Runtime</TableHead>
								<TableHead>Model</TableHead>
								<TableHead>Harness</TableHead>
								<TableHead>Test</TableHead>
								<TableHead>Pass</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Score</TableHead>
								<TableHead>Duration</TableHead>
								<TableHead>Source Run</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredItems.map((item) => (
								<TableRow
									key={`${item.machineProfileId}|${item.id}|${item.sourceRunId}`}
								>
									<TableCell>
										<div className="flex flex-col gap-1">
											<span className="font-medium">
												{item.machineLabel ?? item.machineProfileId}
											</span>
											<Badge variant="secondary" className="w-fit">
												{item.verificationStatus}
											</Badge>
										</div>
									</TableCell>
									<TableCell>{item.runtime}</TableCell>
									<TableCell className="max-w-[240px] truncate">
										{item.model}
									</TableCell>
									<TableCell>{item.harness}</TableCell>
									<TableCell>{item.test}</TableCell>
									<TableCell>{item.passType}</TableCell>
									<TableCell>
										<Badge
											variant={
												item.status === "completed" ? "success" : "destructive"
											}
										>
											{item.status}
										</Badge>
									</TableCell>
									<TableCell>
										{item.automatedScore
											? `${item.automatedScore.passed}/${item.automatedScore.total}`
											: "—"}
									</TableCell>
									<TableCell>
										{item.generation?.durationMs !== undefined
											? formatDuration(item.generation.durationMs)
											: "—"}
									</TableCell>
									<TableCell>
										<div className="flex flex-col gap-1">
											<Link
												to={`/runs/${item.sourceRunId}`}
												className="underline underline-offset-2 hover:text-foreground"
											>
												{item.sourceRunId}
											</Link>
											<span className="text-xs text-foreground-faint">
												{formatDate(item.sourceCompletedAt)}
											</span>
										</div>
									</TableCell>
								</TableRow>
							))}
							{filteredItems.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={10}
										className="text-center text-foreground-muted"
									>
										No items match current filters.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
