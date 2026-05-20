/**
 * Purpose: Dashboard run-comparison data types.
 * Exports: ScoreDelta, EvalDelta, ItemDeltas, MatchedItem, CompareSummary, CompareResult
 *
 * Invariants:
 * - Mirrors compare payloads emitted by the CLI comparison path.
 */

import type { ItemStatus, MatrixItemResult, PassType } from "./types.js";

/** Score delta between two items. */
export interface ScoreDelta {
	passedDelta: number;
	failedDelta: number;
	totalDelta: number;
	passRateDelta: number;
}

/** Frontier eval delta. */
export interface EvalDelta {
	scoreDelta: number;
}

/** Deltas between matched items. */
export interface ItemDeltas {
	status: { a: ItemStatus; b: ItemStatus } | null;
	automatedScore: ScoreDelta | null;
	frontierEval: EvalDelta | null;
	durationMs: number | null;
}

/** Matched item in compare result. */
export interface MatchedItem {
	key: string;
	runtime: string;
	model: string;
	harness: string;
	test: string;
	passType: PassType;
	itemA: MatrixItemResult;
	itemB: MatrixItemResult;
	deltas: ItemDeltas;
}

/** Compare result summary. */
export interface CompareSummary {
	totalMatched: number;
	totalOnlyInA: number;
	totalOnlyInB: number;
	coverage: {
		comparisonSpaceItems: number;
		matchedItems: number;
		unmatchedItems: number;
		matchedCoverageRate: number;
	};
	statusChanges: {
		improved: number;
		regressed: number;
	};
	scoringDelta: {
		passRateDelta: number;
		totalTestsDelta: number;
	} | null;
	trustedScoringDelta: {
		passRateDelta: number;
		totalTestsDelta: number;
	} | null;
	frontierEvalDelta: {
		avgScoreDelta: number;
	} | null;
	trustedFrontierEvalDelta: {
		avgScoreDelta: number;
	} | null;
	metricAvailability: {
		scoring: {
			matchedRows: number;
			comparedRows: number;
			trustedComparedRows: number | null;
		};
		frontierEval: {
			matchedRows: number;
			comparedRows: number;
			trustedComparedRows: number | null;
		};
	};
	signal: {
		trustedMetricsAvailable: boolean;
		taintedInA: number | null;
		taintedInB: number | null;
	};
}

/** Full compare result. */
export interface CompareResult {
	runA: { runId: string; timestamp: string };
	runB: { runId: string; timestamp: string };
	summary: CompareSummary;
	matched: MatchedItem[];
	onlyInA: MatrixItemResult[];
	onlyInB: MatrixItemResult[];
}
