/**
 * Purpose: Run-to-run comparison utilities for the dashboard.
 * Exports: compareRuns
 *
 * Mirrors CLI compare logic so the dashboard can show deltas without
 * re-implementing matching rules in the UI layer.
 *
 * Invariants:
 * - Match key is `runtime|model|harness|test|passType`
 * - Only computes deltas when both sides have the relevant fields present
 */

import {
	computeFrontierStats,
	computeItemPassRate,
	computePassRate,
} from "./aggregations-core.js";
import type { CompareResult, MatchedItem, MatrixItemResult } from "./types.js";

/**
 * Computes comparison between two runs.
 *
 * @param runA - First run (baseline)
 * @param runB - Second run (comparison)
 * @returns Compare result with matched items and deltas
 */
export function compareRuns(
	runA: { runId: string; startedAt: string; items: MatrixItemResult[] },
	runB: { runId: string; startedAt: string; items: MatrixItemResult[] },
): CompareResult {
	const mapA = new Map<string, MatrixItemResult>();
	for (const item of runA.items) {
		const key = `${item.runtime}|${item.model}|${item.harness}|${item.test}|${item.passType}`;
		mapA.set(key, item);
	}

	const matched: MatchedItem[] = [];
	const onlyInB: MatrixItemResult[] = [];

	for (const itemB of runB.items) {
		const key = `${itemB.runtime}|${itemB.model}|${itemB.harness}|${itemB.test}|${itemB.passType}`;
		const itemA = mapA.get(key);

		if (!itemA) {
			onlyInB.push(itemB);
			continue;
		}

		mapA.delete(key);

		const statusDelta =
			itemA.status !== itemB.status
				? { a: itemA.status, b: itemB.status }
				: null;

		const scoreDelta =
			itemA.automatedScore && itemB.automatedScore
				? {
						passedDelta:
							itemB.automatedScore.passed - itemA.automatedScore.passed,
						failedDelta:
							itemB.automatedScore.failed - itemA.automatedScore.failed,
						totalDelta: itemB.automatedScore.total - itemA.automatedScore.total,
						passRateDelta:
							computeItemPassRate(itemB.automatedScore) -
							computeItemPassRate(itemA.automatedScore),
					}
				: null;

		const evalDelta =
			itemA.frontierEval && itemB.frontierEval
				? { scoreDelta: itemB.frontierEval.score - itemA.frontierEval.score }
				: null;

		const durationDelta =
			itemA.generation?.durationMs !== undefined &&
			itemB.generation?.durationMs !== undefined
				? itemB.generation.durationMs - itemA.generation.durationMs
				: null;

		matched.push({
			key,
			runtime: itemB.runtime,
			model: itemB.model,
			harness: itemB.harness,
			test: itemB.test,
			passType: itemB.passType,
			itemA,
			itemB,
			deltas: {
				status: statusDelta,
				automatedScore: scoreDelta,
				frontierEval: evalDelta,
				durationMs: durationDelta,
			},
		});
	}

	const onlyInA = Array.from(mapA.values());
	const comparisonSpaceItems = matched.length + onlyInA.length + onlyInB.length;

	let improved = 0;
	let regressed = 0;
	for (const m of matched) {
		if (!m.deltas.status) continue;
		if (m.deltas.status.a === "failed" && m.deltas.status.b === "completed") {
			improved++;
		} else if (
			m.deltas.status.a === "completed" &&
			m.deltas.status.b === "failed"
		) {
			regressed++;
		}
	}

	const matchedWithScoring = matched.filter(
		(item) => item.itemA.automatedScore && item.itemB.automatedScore,
	);
	const matchedScoringItemsA = matchedWithScoring.map((item) => item.itemA);
	const matchedScoringItemsB = matchedWithScoring.map((item) => item.itemB);
	const passRateA = computePassRate(matchedScoringItemsA);
	const passRateB = computePassRate(matchedScoringItemsB);
	const scoringDelta =
		passRateA.total > 0 || passRateB.total > 0
			? {
					passRateDelta: passRateB.passRate - passRateA.passRate,
					totalTestsDelta: passRateB.total - passRateA.total,
				}
			: null;

	const matchedWithFrontierEval = matched.filter(
		(item) => item.itemA.frontierEval && item.itemB.frontierEval,
	);
	const matchedFrontierItemsA = matchedWithFrontierEval.map(
		(item) => item.itemA,
	);
	const matchedFrontierItemsB = matchedWithFrontierEval.map(
		(item) => item.itemB,
	);
	const frontierA = computeFrontierStats(matchedFrontierItemsA);
	const frontierB = computeFrontierStats(matchedFrontierItemsB);
	const frontierEvalDelta =
		frontierA && frontierB
			? { avgScoreDelta: frontierB.avgScore - frontierA.avgScore }
			: null;

	return {
		runA: { runId: runA.runId, timestamp: runA.startedAt },
		runB: { runId: runB.runId, timestamp: runB.startedAt },
		summary: {
			totalMatched: matched.length,
			totalOnlyInA: onlyInA.length,
			totalOnlyInB: onlyInB.length,
			coverage: {
				comparisonSpaceItems,
				matchedItems: matched.length,
				unmatchedItems: onlyInA.length + onlyInB.length,
				matchedCoverageRate:
					comparisonSpaceItems > 0 ? matched.length / comparisonSpaceItems : 0,
			},
			statusChanges: { improved, regressed },
			scoringDelta,
			trustedScoringDelta: null,
			frontierEvalDelta,
			trustedFrontierEvalDelta: null,
			metricAvailability: {
				scoring: {
					matchedRows: matched.length,
					comparedRows: matchedWithScoring.length,
					trustedComparedRows: null,
				},
				frontierEval: {
					matchedRows: matched.length,
					comparedRows: matchedWithFrontierEval.length,
					trustedComparedRows: null,
				},
			},
			signal: {
				trustedMetricsAvailable: false,
				taintedInA: null,
				taintedInB: null,
			},
		},
		matched,
		onlyInA,
		onlyInB,
	};
}
