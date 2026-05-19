/**
 * Purpose: Compare two benchmark runs and compute deltas.
 * Exports: compareRuns, CompareResult, MatchedItem
 *
 * Performs an outer join on matrix items by composite key.
 * Outputs:
 * - Matched items with deltas
 * - Items only in run A
 * - Items only in run B
 */

import type {
	AutomatedScore,
	FrontierEval,
	MatrixItemResult,
	RunResult,
} from "../schemas/index.js";
import { getModelIdentityKey } from "../lib/model-profiles.js";
import {
	hasCompleteSignalAssessments,
	isTaintedItem,
} from "../lib/signal-assessment.js";

function buildCompareKey(item: {
	model: string;
	runtime: string;
	modelAlias?: string;
	modelProfile?: MatrixItemResult["modelProfile"];
	harness: string;
	test: string;
	passType: string;
}): string {
	const modelKey = getModelIdentityKey(
		item.model,
		item.modelProfile,
		item.modelAlias,
	);
	const runtimeVariantKey = item.modelProfile?.variant.variantKey ?? item.model;
	return `${modelKey}|${item.runtime}|${runtimeVariantKey}|${item.harness}|${item.test}|${item.passType}`;
}

export interface ScoreDelta {
	passedDelta: number;
	failedDelta: number;
	totalDelta: number;
	passRateDelta: number;
}

export interface EvalDelta {
	scoreDelta: number;
}

export interface ItemDeltas {
	status: { a: string; b: string } | null;
	automatedScore: ScoreDelta | null;
	frontierEval: EvalDelta | null;
	durationMs: number | null;
}

export interface MatchedItem {
	key: string;
	model: string;
	harness: string;
	test: string;
	passType: string;
	itemA: MatrixItemResult;
	itemB: MatrixItemResult;
	deltas: ItemDeltas;
}

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

export interface CompareResult {
	runA: {
		runId: string;
		timestamp: string;
	};
	runB: {
		runId: string;
		timestamp: string;
	};
	summary: CompareSummary;
	matched: MatchedItem[];
	onlyInA: MatrixItemResult[];
	onlyInB: MatrixItemResult[];
}

interface AggregateScoring {
	passedTests: number;
	totalTests: number;
	passRate: number;
}

interface AggregateFrontier {
	avgScore: number;
	itemCount: number;
}

function calculatePassRate(score: AutomatedScore | undefined): number | null {
	if (!score || score.total === 0) return null;
	return (score.passed / score.total) * 100;
}

/**
 * Computes aggregate scoring totals for one side of a matched comparison.
 *
 * @param matched - Matched rows to aggregate
 * @param accessor - Reads one side's automated score
 * @returns Aggregate scoring totals
 */
function computeAggregateScoring(
	matched: readonly MatchedItem[],
	accessor: (item: MatchedItem) => AutomatedScore | undefined,
): AggregateScoring {
	let passedTests = 0;
	let totalTests = 0;

	for (const item of matched) {
		const score = accessor(item);
		if (!score) {
			continue;
		}
		passedTests += score.passed;
		totalTests += score.total;
	}

	return {
		passedTests,
		totalTests,
		passRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
	};
}

/**
 * Computes aggregate frontier evaluation stats for one side of a comparison.
 *
 * @param matched - Matched rows to aggregate
 * @param accessor - Reads one side's frontier eval
 * @returns Aggregate frontier stats
 */
function computeAggregateFrontier(
	matched: readonly MatchedItem[],
	accessor: (item: MatchedItem) => FrontierEval | undefined,
): AggregateFrontier {
	let totalScore = 0;
	let itemCount = 0;

	for (const item of matched) {
		const frontierEval = accessor(item);
		if (!frontierEval) {
			continue;
		}
		totalScore += frontierEval.score;
		itemCount += 1;
	}

	return {
		avgScore: itemCount > 0 ? totalScore / itemCount : 0,
		itemCount,
	};
}

function computeDeltas(a: MatrixItemResult, b: MatrixItemResult): ItemDeltas {
	const statusChanged = a.status !== b.status;
	const status = statusChanged ? { a: a.status, b: b.status } : null;

	let automatedScore: ScoreDelta | null = null;
	if (a.automatedScore && b.automatedScore) {
		const scoreA = a.automatedScore;
		const scoreB = b.automatedScore;
		const passRateA = calculatePassRate(scoreA) ?? 0;
		const passRateB = calculatePassRate(scoreB) ?? 0;

		automatedScore = {
			passedDelta: scoreB.passed - scoreA.passed,
			failedDelta: scoreB.failed - scoreA.failed,
			totalDelta: scoreB.total - scoreA.total,
			passRateDelta: passRateB - passRateA,
		};
	}

	let frontierEval: EvalDelta | null = null;
	if (a.frontierEval && b.frontierEval) {
		const scoreA = a.frontierEval.score;
		const scoreB = b.frontierEval.score;
		frontierEval = {
			scoreDelta: scoreB - scoreA,
		};
	}

	let durationMs: number | null = null;
	const durA = a.generation?.durationMs;
	const durB = b.generation?.durationMs;
	if (durA !== undefined && durB !== undefined) {
		durationMs = durB - durA;
	}

	return { status, automatedScore, frontierEval, durationMs };
}

function computeSummary(
	matched: MatchedItem[],
	onlyInA: MatrixItemResult[],
	onlyInB: MatrixItemResult[],
	runAItems: MatrixItemResult[],
	runBItems: MatrixItemResult[],
): CompareSummary {
	let improved = 0;
	let regressed = 0;
	for (const m of matched) {
		if (m.deltas.status) {
			if (m.deltas.status.a === "failed" && m.deltas.status.b === "completed") {
				improved++;
			} else if (m.deltas.status.a === "completed" && m.deltas.status.b === "failed") {
				regressed++;
			}
		}
	}

	let scoringDelta: CompareSummary["scoringDelta"] = null;
	let trustedScoringDelta: CompareSummary["trustedScoringDelta"] = null;
	const matchedWithScoring = matched.filter(
		(item) => item.itemA.automatedScore && item.itemB.automatedScore,
	);
	const rawScoringA = computeAggregateScoring(
		matchedWithScoring,
		(item) => item.itemA.automatedScore,
	);
	const rawScoringB = computeAggregateScoring(
		matchedWithScoring,
		(item) => item.itemB.automatedScore,
	);

	if (matchedWithScoring.length > 0) {
		scoringDelta = {
			passRateDelta: rawScoringB.passRate - rawScoringA.passRate,
			totalTestsDelta: rawScoringB.totalTests - rawScoringA.totalTests,
		};
	}

	let frontierEvalDelta: CompareSummary["frontierEvalDelta"] = null;
	let trustedFrontierEvalDelta: CompareSummary["trustedFrontierEvalDelta"] = null;
	const matchedWithFrontierEval = matched.filter(
		(item) => item.itemA.frontierEval && item.itemB.frontierEval,
	);
	const rawFrontierA = computeAggregateFrontier(
		matchedWithFrontierEval,
		(item) => item.itemA.frontierEval,
	);
	const rawFrontierB = computeAggregateFrontier(
		matchedWithFrontierEval,
		(item) => item.itemB.frontierEval,
	);

	if (matchedWithFrontierEval.length > 0) {
		frontierEvalDelta = {
			avgScoreDelta: rawFrontierB.avgScore - rawFrontierA.avgScore,
		};
	}

	const matchedItemsA = matched.map((item) => item.itemA);
	const matchedItemsB = matched.map((item) => item.itemB);
	const matchedMetricsComplete =
		hasCompleteSignalAssessments(matchedItemsA) &&
		hasCompleteSignalAssessments(matchedItemsB);
	const trustedMetricsAvailable =
		hasCompleteSignalAssessments(runAItems) &&
		hasCompleteSignalAssessments(runBItems);

	if (matchedMetricsComplete) {
		const trustedMatched = matched.filter(
			(match) => !isTaintedItem(match.itemA) && !isTaintedItem(match.itemB),
		);
		const trustedMatchedWithScoring = trustedMatched.filter(
			(item) => item.itemA.automatedScore && item.itemB.automatedScore,
		);
		const trustedScoringA = computeAggregateScoring(
			trustedMatchedWithScoring,
			(item) => item.itemA.automatedScore,
		);
		const trustedScoringB = computeAggregateScoring(
			trustedMatchedWithScoring,
			(item) => item.itemB.automatedScore,
		);
		if (trustedMatchedWithScoring.length > 0) {
			trustedScoringDelta = {
				passRateDelta: trustedScoringB.passRate - trustedScoringA.passRate,
				totalTestsDelta:
					trustedScoringB.totalTests - trustedScoringA.totalTests,
			};
		}

		const trustedMatchedWithFrontierEval = trustedMatched.filter(
			(item) => item.itemA.frontierEval && item.itemB.frontierEval,
		);
		const trustedFrontierA = computeAggregateFrontier(
			trustedMatchedWithFrontierEval,
			(item) => item.itemA.frontierEval,
		);
		const trustedFrontierB = computeAggregateFrontier(
			trustedMatchedWithFrontierEval,
			(item) => item.itemB.frontierEval,
		);
		if (trustedMatchedWithFrontierEval.length > 0) {
			trustedFrontierEvalDelta = {
				avgScoreDelta: trustedFrontierB.avgScore - trustedFrontierA.avgScore,
			};
		}
	}

	return {
		totalMatched: matched.length,
		totalOnlyInA: onlyInA.length,
		totalOnlyInB: onlyInB.length,
		coverage: {
			comparisonSpaceItems: matched.length + onlyInA.length + onlyInB.length,
			matchedItems: matched.length,
			unmatchedItems: onlyInA.length + onlyInB.length,
			matchedCoverageRate:
				matched.length + onlyInA.length + onlyInB.length > 0
					? matched.length / (matched.length + onlyInA.length + onlyInB.length)
					: 0,
		},
		statusChanges: { improved, regressed },
		scoringDelta,
		trustedScoringDelta,
		frontierEvalDelta,
		trustedFrontierEvalDelta,
		metricAvailability: {
			scoring: {
				matchedRows: matched.length,
				comparedRows: matchedWithScoring.length,
				trustedComparedRows: matchedMetricsComplete
					? matched.filter(
							(item) =>
								!isTaintedItem(item.itemA) &&
								!isTaintedItem(item.itemB) &&
								item.itemA.automatedScore &&
								item.itemB.automatedScore,
						).length
					: null,
			},
			frontierEval: {
				matchedRows: matched.length,
				comparedRows: matchedWithFrontierEval.length,
				trustedComparedRows: matchedMetricsComplete
					? matched.filter(
							(item) =>
								!isTaintedItem(item.itemA) &&
								!isTaintedItem(item.itemB) &&
								item.itemA.frontierEval &&
								item.itemB.frontierEval,
						).length
					: null,
			},
		},
		signal: {
			trustedMetricsAvailable: matchedMetricsComplete,
			taintedInA: trustedMetricsAvailable
				? runAItems.filter((item) => isTaintedItem(item)).length
				: null,
			taintedInB: trustedMetricsAvailable
				? runBItems.filter((item) => isTaintedItem(item)).length
				: null,
		},
	};
}

/**
 * Compares two benchmark runs.
 *
 * @param resultA - First run result (baseline)
 * @param resultB - Second run result (comparison)
 * @returns Comparison result with deltas
 *
 */
export function compareRuns(resultA: RunResult, resultB: RunResult): CompareResult {
	const mapA = new Map<string, MatrixItemResult>();
	const mapB = new Map<string, MatrixItemResult>();

	for (const item of resultA.items) {
		const key = buildCompareKey(item);
		if (mapA.has(key)) {
			throw new Error(`Duplicate compare key in run A: ${key}`);
		}
		mapA.set(key, item);
	}

	for (const item of resultB.items) {
		const key = buildCompareKey(item);
		if (mapB.has(key)) {
			throw new Error(`Duplicate compare key in run B: ${key}`);
		}
		mapB.set(key, item);
	}

	const matched: MatchedItem[] = [];
	const onlyInA: MatrixItemResult[] = [];
	const onlyInB: MatrixItemResult[] = [];

	for (const [key, itemA] of mapA) {
		const itemB = mapB.get(key);
		if (itemB) {
			matched.push({
				key,
				model:
					itemA.modelProfile?.canonical.profileLabel ??
					itemA.modelAlias ??
					itemA.model,
				harness: itemA.harness,
				test: itemA.test,
				passType: itemA.passType,
				itemA,
				itemB,
				deltas: computeDeltas(itemA, itemB),
			});
		} else {
			onlyInA.push(itemA);
		}
	}

	for (const [key, itemB] of mapB) {
		if (!mapA.has(key)) {
			onlyInB.push(itemB);
		}
	}

	matched.sort((a, b) => a.key.localeCompare(b.key));
	onlyInA.sort((a, b) => buildCompareKey(a).localeCompare(buildCompareKey(b)));
	onlyInB.sort((a, b) => buildCompareKey(a).localeCompare(buildCompareKey(b)));

	const summary = computeSummary(
		matched,
		onlyInA,
		onlyInB,
		resultA.items,
		resultB.items,
	);

	return {
		runA: {
			runId: resultA.runId,
			timestamp: resultA.startedAt,
		},
		runB: {
			runId: resultB.runId,
			timestamp: resultB.startedAt,
		},
		summary,
		matched,
		onlyInA,
		onlyInB,
	};
}
