/**
 * Purpose: Shared leaderboard aggregate selection helpers.
 * Exports: buildAggregateKey, compareAggregateCandidates,
 *          sortAggregatedItems, resolveItemTimestamp,
 *          resolveModelProfileResolutionSource
 *
 * Invariants:
 * - Aggregate keys use Machine Profile plus benchmark matrix identity.
 * - Duplicate keys prefer Best Observed Item semantics before latest tie-breaks.
 */

import { getModelIdentityKey } from "../lib/model-profiles.js";
import type {
	MatrixItemResult,
	ModelProfileResolutionSource,
} from "../schemas/index.js";
import type { AggregatedMatrixItem } from "./aggregate.js";

/**
 * Builds the deterministic aggregation key for one matrix item.
 *
 * @param machineProfileKey - Machine profile key
 * @param item - Matrix item
 * @returns Stable aggregation key
 */
export function buildAggregateKey(
	machineProfileKey: string,
	item: MatrixItemResult,
): string {
	const canonicalModel = getModelIdentityKey(
		item.model,
		item.modelProfile,
		item.modelAlias,
	);
	return `${machineProfileKey}|${item.runtime}|${canonicalModel}|${item.harness}|${item.test}|${item.passType}`;
}

/**
 * Converts timestamp fields into a comparable unix epoch value.
 *
 * @param value - ISO timestamp
 * @returns Epoch milliseconds, or 0 when invalid/missing
 */
function toEpochMs(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Produces a deterministic primary timestamp for latest-wins comparisons.
 *
 * @param run - Run result containing fallback timestamps
 * @param item - Matrix item for per-item timestamps
 * @returns Comparable epoch value
 */
export function resolveItemTimestamp(
	run: { completedAt?: string; startedAt?: string },
	item: MatrixItemResult,
): number {
	return Math.max(
		toEpochMs(item.completedAt),
		toEpochMs(item.startedAt),
		toEpochMs(run.completedAt),
		toEpochMs(run.startedAt),
	);
}

/**
 * Assigns an ordering weight to item execution status.
 *
 * @param status - Item execution status
 * @returns Numeric rank where larger means better
 */
function getStatusRank(status: MatrixItemResult["status"]): number {
	switch (status) {
		case "completed":
			return 3;
		case "failed":
			return 2;
		case "running":
			return 1;
		case "pending":
			return 0;
	}
}

/**
 * Produces a comparable pass-rate score for best-result selection.
 *
 * @param item - Matrix item candidate
 * @returns Pass-rate fraction in [0, 1], or -1 when unavailable
 */
function getAutomatedPassRate(item: MatrixItemResult): number {
	if (!item.automatedScore || item.automatedScore.total <= 0) {
		return -1;
	}
	return item.automatedScore.passed / item.automatedScore.total;
}

/**
 * Compares two aggregate candidates for the same profile+matrix key.
 *
 * @param candidate - New candidate entry
 * @param incumbent - Existing entry
 * @returns Positive when candidate should replace incumbent
 */
export function compareAggregateCandidates(
	candidate: { timestamp: number; aggregated: AggregatedMatrixItem },
	incumbent: { timestamp: number; aggregated: AggregatedMatrixItem },
): number {
	const statusDelta =
		getStatusRank(candidate.aggregated.status) -
		getStatusRank(incumbent.aggregated.status);
	if (statusDelta !== 0) return statusDelta;

	const passRateDelta =
		getAutomatedPassRate(candidate.aggregated) -
		getAutomatedPassRate(incumbent.aggregated);
	if (passRateDelta !== 0) return passRateDelta;

	const passedDelta =
		(candidate.aggregated.automatedScore?.passed ?? -1) -
		(incumbent.aggregated.automatedScore?.passed ?? -1);
	if (passedDelta !== 0) return passedDelta;

	const totalDelta =
		(candidate.aggregated.automatedScore?.total ?? -1) -
		(incumbent.aggregated.automatedScore?.total ?? -1);
	if (totalDelta !== 0) return totalDelta;

	const frontierDelta =
		(candidate.aggregated.frontierEval?.score ?? -1) -
		(incumbent.aggregated.frontierEval?.score ?? -1);
	if (frontierDelta !== 0) return frontierDelta;

	const generationSuccessDelta =
		Number(candidate.aggregated.generation?.success === true) -
		Number(incumbent.aggregated.generation?.success === true);
	if (generationSuccessDelta !== 0) return generationSuccessDelta;

	const candidateDuration = candidate.aggregated.generation?.durationMs;
	const incumbentDuration = incumbent.aggregated.generation?.durationMs;
	if (
		candidateDuration !== undefined &&
		incumbentDuration !== undefined &&
		candidateDuration !== incumbentDuration
	) {
		return incumbentDuration - candidateDuration;
	}

	if (candidate.timestamp !== incumbent.timestamp) {
		return candidate.timestamp - incumbent.timestamp;
	}
	if (
		candidate.aggregated.sourceCompletedAt !==
		incumbent.aggregated.sourceCompletedAt
	) {
		return candidate.aggregated.sourceCompletedAt.localeCompare(
			incumbent.aggregated.sourceCompletedAt,
		);
	}
	return candidate.aggregated.sourceRunId.localeCompare(
		incumbent.aggregated.sourceRunId,
	);
}

/**
 * Sorts aggregated items into deterministic order.
 *
 * @param left - First aggregated item
 * @param right - Second aggregated item
 * @returns Sort comparator result
 */
export function sortAggregatedItems(
	left: AggregatedMatrixItem,
	right: AggregatedMatrixItem,
): number {
	const leftKey = buildAggregateKey(left.machineProfileKey, left);
	const rightKey = buildAggregateKey(right.machineProfileKey, right);
	if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
	if (left.sourceCompletedAt !== right.sourceCompletedAt) {
		return left.sourceCompletedAt.localeCompare(right.sourceCompletedAt);
	}
	return left.sourceRunId.localeCompare(right.sourceRunId);
}

/**
 * Resolves visible Model Profile Resolution provenance for analysis output.
 *
 * @param item - Matrix item with optional model profile or legacy alias
 * @returns Model profile resolution source
 */
export function resolveModelProfileResolutionSource(
	item: MatrixItemResult,
): ModelProfileResolutionSource {
	if (item.modelProfile) {
		return item.modelProfile.resolutionSource;
	}
	if (item.modelAlias) {
		return "legacy_alias";
	}
	return "runtime_name";
}
