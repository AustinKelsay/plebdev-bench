/**
 * Purpose: Latest-checkpoint leaderboard view aggregating deduped items across runs.
 * Exports: LeaderboardPage
 *
 * Invariants:
 * - Renders only aggregate payload from `/results/aggregates/latest.json`
 * - Filter state controls every summary, chart, and table on the page
 */

import { LeaderboardChartGallery } from "@/components/leaderboard/leaderboard-chart-gallery";
import { LeaderboardHero } from "@/components/leaderboard/leaderboard-hero";
import { LeaderboardLatestRuns } from "@/components/leaderboard/leaderboard-latest-runs";
import { LeaderboardModelVettingTable } from "@/components/leaderboard/leaderboard-model-vetting-table";
import { LeaderboardResultsTable } from "@/components/leaderboard/leaderboard-results-table";
import { LeaderboardSummaryCards } from "@/components/leaderboard/leaderboard-summary-cards";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { ModelFilterDropdown } from "@/components/leaderboard/model-filter-dropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { RotateCcw } from "lucide-react";
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
	const statusOptions = useMemo(
		() => uniqueValues(items, (item) => item.status),
		[items],
	);
	const categoryOptions = useMemo(
		() => uniqueValues(items, (item) => item.category),
		[items],
	);
	const verificationOptions = useMemo(
		() => uniqueValues(items, (item) => item.verificationStatus),
		[items],
	);
	const activeFilterCount = [
		filters.machine !== ALL_FILTER_VALUE,
		filters.models.length > 0,
		filters.search.trim().length > 0,
		filters.runtime !== ALL_FILTER_VALUE,
		filters.harness !== ALL_FILTER_VALUE,
		filters.passType !== ALL_FILTER_VALUE,
		filters.test !== ALL_FILTER_VALUE,
		filters.status !== ALL_FILTER_VALUE,
		filters.category !== ALL_FILTER_VALUE,
		filters.verification !== ALL_FILTER_VALUE,
	].filter(Boolean).length;

	if (loading) {
		return (
			<PageContainer>
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-[28rem] rounded-2xl" />
				<div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
				</div>
				<Skeleton className="h-[32rem]" />
				<Skeleton className="h-[26rem]" />
				<Skeleton className="h-[30rem]" />
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
		<PageContainer className="space-y-8">
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

			<LeaderboardHero
				aggregate={aggregate}
				items={filteredItems}
				passRate={passRate}
			/>

			<Card className="border-border/80 bg-card/85 backdrop-blur">
				<CardHeader className="gap-2 pb-3">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<CardTitle className="text-base">Filters</CardTitle>
							<p className="mt-1 text-sm leading-6 text-foreground-muted">
								Constrain the benchmark slice, then read every chart and table as
								“within current filters”.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<p className="text-xs uppercase tracking-[0.18em] text-foreground-faint">
								{activeFilterCount} active
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setFilters(createDefaultFilterState())}
							>
								<RotateCcw className="mr-2 h-4 w-4" />
								Clear
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						<Input
							value={filters.search}
							onChange={(event) =>
								setFilters((previous) => ({
									...previous,
									search: event.target.value,
								}))
							}
							placeholder="Search model, harness, test, machine"
							aria-label="Search leaderboard scope"
						/>

						<ModelFilterDropdown
							models={modelOptions}
							selectedModels={filters.models}
							onSelectionChange={(models) =>
								setFilters((previous) => ({ ...previous, models }))
							}
						/>

						<Select
							value={filters.machine}
							onValueChange={(value) =>
								setFilters((previous) => ({ ...previous, machine: value }))
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

						<Select
							value={filters.runtime}
							onValueChange={(value) =>
								setFilters((previous) => ({ ...previous, runtime: value }))
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
								setFilters((previous) => ({ ...previous, harness: value }))
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
								setFilters((previous) => ({ ...previous, passType: value }))
							}
						>
							<SelectTrigger aria-label="Pass type filter">
								<SelectValue placeholder="Pass type" />
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
								setFilters((previous) => ({ ...previous, test: value }))
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

						<Select
							value={filters.status}
							onValueChange={(value) =>
								setFilters((previous) => ({ ...previous, status: value }))
							}
						>
							<SelectTrigger aria-label="Status filter">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
								{statusOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.category}
							onValueChange={(value) =>
								setFilters((previous) => ({ ...previous, category: value }))
							}
						>
							<SelectTrigger aria-label="Category filter">
								<SelectValue placeholder="Category" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
								{categoryOptions.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.verification}
							onValueChange={(value) =>
								setFilters((previous) => ({
									...previous,
									verification: value,
								}))
							}
						>
							<SelectTrigger aria-label="Verification filter">
								<SelectValue placeholder="Verification" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>
									All provenance states
								</SelectItem>
								{verificationOptions.map((option) => (
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
				items={filteredItems}
				passRate={passRate}
			/>

			<LeaderboardChartGallery items={filteredItems} />

			<LeaderboardModelVettingTable items={filteredItems} />

			<LeaderboardLatestRuns
				runs={latestRuns}
				latestCheckpointId={index?.latestCheckpointId ?? null}
			/>

			{(aggregate?.summary.runsMatched ?? 0) === 0 &&
				(index?.runs.length ?? 0) > 0 && (
					<div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
						No published runs match latest checkpoint {index?.latestCheckpointId}{" "}
						yet.
					</div>
				)}

			<LeaderboardResultsTable items={filteredItems} />
		</PageContainer>
	);
}
