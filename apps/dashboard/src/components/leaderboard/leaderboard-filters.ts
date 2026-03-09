/**
 * Purpose: Shared filter state and selectors for leaderboard aggregation views.
 * Exports: ALL_FILTER_VALUE, FilterState, MachineFilterOption,
 *          createDefaultFilterState, uniqueValues, buildMachineFilterOptions,
 *          filterItems
 *
 * Invariants:
 * - Filter sentinel value is stable (`all`) across all filter controls
 * - Machine filter labels are disambiguated when duplicate labels exist
 */

import type { LeaderboardAggregatedItem } from "@/lib/types";

/** Sentinel value meaning "no filter". */
export const ALL_FILTER_VALUE = "all";

/** Active leaderboard filter state. */
export interface FilterState {
	machine: string;
	models: string[];
	search: string;
	runtime: string;
	harness: string;
	passType: string;
	test: string;
	status: string;
	category: string;
	verification: string;
}

/** Machine dropdown option resolved from aggregate items. */
export interface MachineFilterOption {
	value: string;
	label: string;
}

/**
 * Returns default filter values for leaderboard controls.
 *
 * @returns Initialized filter state
 */
export function createDefaultFilterState(): FilterState {
	return {
		machine: ALL_FILTER_VALUE,
		models: [],
		search: "",
		runtime: ALL_FILTER_VALUE,
		harness: ALL_FILTER_VALUE,
		passType: ALL_FILTER_VALUE,
		test: ALL_FILTER_VALUE,
		status: ALL_FILTER_VALUE,
		category: ALL_FILTER_VALUE,
		verification: ALL_FILTER_VALUE,
	};
}

/**
 * Returns sorted unique values from an item list.
 *
 * @param items - Aggregated leaderboard items
 * @param selector - Field selector callback
 * @returns Sorted unique values
 */
export function uniqueValues(
	items: LeaderboardAggregatedItem[],
	selector: (item: LeaderboardAggregatedItem) => string | undefined,
): string[] {
	return [...new Set(items.map(selector).filter((value): value is string => Boolean(value)))]
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Builds machine filter options keyed by stable machine profile ID.
 *
 * @param items - Aggregated leaderboard items
 * @returns Machine options for filter dropdown
 */
export function buildMachineFilterOptions(
	items: LeaderboardAggregatedItem[],
): MachineFilterOption[] {
	const machineMap = new Map<string, { machineLabel?: string }>();
	for (const item of items) {
		const existing = machineMap.get(item.machineProfileId);
		if (!existing || (!existing.machineLabel && item.machineLabel)) {
			machineMap.set(item.machineProfileId, {
				...(item.machineLabel ? { machineLabel: item.machineLabel } : {}),
			});
		}
	}

	const baseOptions = [...machineMap.entries()].map(([machineProfileId, value]) => ({
		value: machineProfileId,
		label: value.machineLabel ?? machineProfileId,
	}));
	const labelCounts = new Map<string, number>();
	for (const option of baseOptions) {
		labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
	}

	return baseOptions
		.map((option) => ({
			value: option.value,
			label:
				(labelCounts.get(option.label) ?? 0) > 1
					? `${option.label} (${option.value})`
					: option.label,
		}))
		.sort((a, b) =>
			a.label === b.label
				? a.value.localeCompare(b.value)
				: a.label.localeCompare(b.label),
		);
}

/**
 * Applies filter state to aggregated items.
 *
 * @param items - Aggregated leaderboard items
 * @param filters - Current filter state
 * @returns Filtered item list
 */
export function filterItems(
	items: LeaderboardAggregatedItem[],
	filters: FilterState,
): LeaderboardAggregatedItem[] {
	const normalizedSearch = filters.search.trim().toLowerCase();
	return items.filter((item) => {
		if (filters.machine !== ALL_FILTER_VALUE) {
			if (item.machineProfileId !== filters.machine) return false;
		}
		if (filters.models.length > 0 && !filters.models.includes(item.model)) {
			return false;
		}
		if (
			filters.runtime !== ALL_FILTER_VALUE &&
			item.runtime !== filters.runtime
		) {
			return false;
		}
		if (
			filters.harness !== ALL_FILTER_VALUE &&
			item.harness !== filters.harness
		) {
			return false;
		}
		if (
			filters.passType !== ALL_FILTER_VALUE &&
			item.passType !== filters.passType
		) {
			return false;
		}
		if (filters.test !== ALL_FILTER_VALUE && item.test !== filters.test) {
			return false;
		}
		if (filters.status !== ALL_FILTER_VALUE && item.status !== filters.status) {
			return false;
		}
		if (
			filters.category !== ALL_FILTER_VALUE &&
			item.category !== filters.category
		) {
			return false;
		}
		if (
			filters.verification !== ALL_FILTER_VALUE &&
			item.verificationStatus !== filters.verification
		) {
			return false;
		}
		if (normalizedSearch.length > 0) {
			const haystack = [
				item.model,
				item.runtime,
				item.harness,
				item.test,
				item.passType,
				item.machineLabel,
				item.machineProfileId,
			]
				.filter((value): value is string => Boolean(value))
				.join(" ")
				.toLowerCase();
			if (!haystack.includes(normalizedSearch)) {
				return false;
			}
		}
		return true;
	});
}
