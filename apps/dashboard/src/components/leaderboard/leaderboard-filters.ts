/**
 * Purpose: Shared filter state and selectors for leaderboard aggregation views.
 * Exports: ALL_FILTER_VALUE, FilterState, MachineFilterOption,
 *          createDefaultFilterState, uniqueValues, buildMachineFilterOptions,
 *          buildModelVariantFilterOptions, buildModelQuantizationFilterOptions,
 *          filterItems
 *
 * Invariants:
 * - Filter sentinel value is stable (`all`) across all filter controls
 * - Machine filter labels are disambiguated when duplicate labels exist
 */

import type { LeaderboardAggregatedItem } from "../../lib/types.js";

/** Sentinel value meaning "no filter". */
export const ALL_FILTER_VALUE = "all";

/** Active leaderboard filter state. */
export interface FilterState {
	machine: string;
	models: string[];
	modelVariant: string;
	modelQuantization: string;
	runtime: string;
	harness: string;
	passType: string;
	testType: string;
	test: string;
}

/** Machine dropdown option resolved from aggregate items. */
export interface MachineFilterOption {
	value: string;
	label: string;
}

/** Generic dropdown option resolved from aggregate items. */
export interface LeaderboardFilterOption {
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
		modelVariant: ALL_FILTER_VALUE,
		modelQuantization: ALL_FILTER_VALUE,
		runtime: ALL_FILTER_VALUE,
		harness: ALL_FILTER_VALUE,
		passType: ALL_FILTER_VALUE,
		testType: ALL_FILTER_VALUE,
		test: ALL_FILTER_VALUE,
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
	selector: (item: LeaderboardAggregatedItem) => string,
): string[] {
	return [...new Set(items.map(selector))].sort((a, b) => a.localeCompare(b));
}

/**
 * Returns the display identity used for default Model Profile grouping.
 *
 * @param item - Aggregated leaderboard item
 * @returns Canonical Model Profile label, alias, or runtime model name
 * @throws {never}
 */
export function getModelProfileDisplayName(
	item: LeaderboardAggregatedItem,
): string {
	return (
		item.modelProfile?.canonical.profileLabel ?? item.modelAlias ?? item.model
	);
}

/**
 * Returns the stable filter value for a row's Model Variant.
 *
 * @param item - Aggregated leaderboard item
 * @returns Variant key when available, otherwise runtime model name
 * @throws {never}
 */
export function getModelVariantFilterValue(
	item: LeaderboardAggregatedItem,
): string {
	return item.modelProfile?.variant.variantKey ?? item.model;
}

/**
 * Returns the display label for a row's Model Variant.
 *
 * @param item - Aggregated leaderboard item
 * @returns Variant label with runtime model fallback
 * @throws {never}
 */
export function getModelVariantFilterLabel(
	item: LeaderboardAggregatedItem,
): string {
	return item.modelProfile?.variant.variantLabel ?? item.model;
}

/**
 * Returns the quantization filter value for a row's Model Variant.
 *
 * @param item - Aggregated leaderboard item
 * @returns Quantization label or explicit unspecified sentinel
 * @throws {never}
 */
export function getModelQuantizationFilterValue(
	item: LeaderboardAggregatedItem,
): string {
	return item.modelProfile?.variant.quantization ?? "unspecified";
}

/**
 * Builds Model Variant options keyed by stable variant identity.
 *
 * @param items - Aggregated leaderboard items
 * @returns Variant options for filter dropdowns
 * @throws {never}
 */
export function buildModelVariantFilterOptions(
	items: LeaderboardAggregatedItem[],
): LeaderboardFilterOption[] {
	const optionMap = new Map<string, string>();
	for (const item of items) {
		const value = getModelVariantFilterValue(item);
		const label = getModelVariantFilterLabel(item);
		if (!optionMap.has(value)) {
			optionMap.set(value, label);
		}
	}

	return [...optionMap.entries()]
		.map(([value, label]) => ({ value, label }))
		.sort((a, b) =>
			a.label === b.label
				? a.value.localeCompare(b.value)
				: a.label.localeCompare(b.label),
		);
}

/**
 * Builds Model Variant quantization options.
 *
 * @param items - Aggregated leaderboard items
 * @returns Quantization options for filter dropdowns
 * @throws {never}
 */
export function buildModelQuantizationFilterOptions(
	items: LeaderboardAggregatedItem[],
): LeaderboardFilterOption[] {
	return uniqueValues(items, getModelQuantizationFilterValue).map((value) => ({
		value,
		label: value === "unspecified" ? "Unspecified" : value,
	}));
}

/**
 * Builds machine filter options keyed by stable machine profile key.
 *
 * @param items - Aggregated leaderboard items
 * @returns Machine options for filter dropdown
 */
export function buildMachineFilterOptions(
	items: LeaderboardAggregatedItem[],
): MachineFilterOption[] {
	const machineMap = new Map<string, { machineProfileLabel?: string }>();
	for (const item of items) {
		const existing = machineMap.get(item.machineProfileKey);
		if (
			!existing ||
			(!existing.machineProfileLabel && item.machineProfileLabel)
		) {
			machineMap.set(item.machineProfileKey, {
				...(item.machineProfileLabel
					? { machineProfileLabel: item.machineProfileLabel }
					: {}),
			});
		}
	}

	const baseOptions = [...machineMap.entries()].map(
		([machineProfileKey, value]) => ({
			value: machineProfileKey,
			label: value.machineProfileLabel ?? machineProfileKey,
		}),
	);
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
	return items.filter((item) => {
		if (filters.machine !== ALL_FILTER_VALUE) {
			if (item.machineProfileKey !== filters.machine) return false;
		}
		if (filters.models.length > 0 && !filters.models.includes(item.model)) {
			return false;
		}
		if (
			filters.modelVariant !== ALL_FILTER_VALUE &&
			getModelVariantFilterValue(item) !== filters.modelVariant
		) {
			return false;
		}
		if (
			filters.modelQuantization !== ALL_FILTER_VALUE &&
			getModelQuantizationFilterValue(item) !== filters.modelQuantization
		) {
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
		if (filters.testType !== ALL_FILTER_VALUE) {
			const itemTestType = item.category ?? "uncategorized";
			if (itemTestType !== filters.testType) return false;
		}
		if (filters.test !== ALL_FILTER_VALUE && item.test !== filters.test) {
			return false;
		}
		return true;
	});
}
