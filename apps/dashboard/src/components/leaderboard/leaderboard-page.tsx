/**
 * Purpose: Latest-checkpoint leaderboard view aggregating deduped items across runs.
 * Exports: LeaderboardPage
 *
 * Invariants:
 * - Renders only aggregate payload from `/results/aggregates/latest.json`
 * - Aggregation is precomputed using machine+matrix-key best-result semantics
 */

import { LeaderboardChartGallery } from "@/components/leaderboard/leaderboard-chart-gallery";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { LeaderboardLatestRuns } from "@/components/leaderboard/leaderboard-latest-runs";
import { LeaderboardResultsTable } from "@/components/leaderboard/leaderboard-results-table";
import { LeaderboardSummaryCards } from "@/components/leaderboard/leaderboard-summary-cards";
import { ModelFilterDropdown } from "@/components/leaderboard/model-filter-dropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { computePassRate } from "@/lib/aggregations";
import { fetchDashboardIndex, fetchLatestAggregate } from "@/lib/api";
import type { DashboardIndex, LeaderboardAggregate } from "@/lib/types";
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
	const latestRuns = useMemo(() => index?.runs.slice(0, 6) ?? [], [index]);

	const machineOptions = useMemo(
		() => buildMachineFilterOptions(items),
		[items],
	);
	const runtimeOptions = useMemo(
		() => uniqueValues(items, (item) => item.runtime),
		[items],
	);
	const modelOptions = useMemo(
		() => uniqueValues(items, (item) => item.model),
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
				<Skeleton className="h-[32rem]" />
				<div className="grid gap-4 lg:grid-cols-3">
					<Skeleton className="h-40" />
					<Skeleton className="h-40" />
					<Skeleton className="h-40" />
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
						? `Latest checkpoint ${aggregate.checkpointId} across ${aggregate.summary.runsMatched} matched runs`
						: "Latest checkpoint aggregate"
				}
			>
				<Link to="/runs">
					<Button variant="outline" size="sm">
						All Runs
					</Button>
				</Link>
			</PageHeader>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 md:grid-cols-6">
						<Select
							value={filters.machine}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, machine: value }))
							}
						>
							<SelectTrigger aria-label="Machine filter">
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

						<ModelFilterDropdown
							models={modelOptions}
							selectedModels={filters.models}
							onSelectionChange={(models) =>
								setFilters((prev) => ({ ...prev, models }))
							}
						/>

						<Select
							value={filters.runtime}
							onValueChange={(value) =>
								setFilters((prev) => ({ ...prev, runtime: value }))
							}
						>
							<SelectTrigger aria-label="Runtime filter">
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
							<SelectTrigger aria-label="Harness filter">
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
							<SelectTrigger aria-label="Pass type filter">
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
							<SelectTrigger aria-label="Test filter">
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

			<LeaderboardSummaryCards
				aggregate={aggregate}
				filteredItemCount={filteredItems.length}
				passRate={passRate}
			/>

			<LeaderboardChartGallery items={filteredItems} />

			<LeaderboardLatestRuns
				runs={latestRuns}
				latestCheckpointId={index?.latestCheckpointId ?? null}
			/>

			{(aggregate?.summary.runsMatched ?? 0) === 0 &&
				(index?.runs.length ?? 0) > 0 && (
					<div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
						No published runs match latest checkpoint{" "}
						{index?.latestCheckpointId} yet.
					</div>
				)}

			<LeaderboardResultsTable items={filteredItems} />
		</PageContainer>
	);
}
