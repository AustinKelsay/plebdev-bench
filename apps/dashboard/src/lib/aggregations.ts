/**
 * Purpose: Compute aggregated statistics from run data.
 * Exports: computePassRate, groupByModel, groupByHarness, computeTimingStats, etc.
 */
import type { MatrixItemResult, AutomatedScore, MatchedItem, CompareResult } from "./types";

/** Pass rate for a set of items (0-1 range) */
export interface PassRateResult {
  passRate: number;
  passed: number;
  total: number;
}

/**
 * Computes pass rate from automated scores.
 * @param items - Matrix items with optional automatedScore
 * @returns Pass rate as 0-1 value, plus passed/total counts
 */
export function computePassRate(items: MatrixItemResult[]): PassRateResult {
  const withScores = items.filter((i) => i.automatedScore);
  if (withScores.length === 0) {
    return { passRate: 0, passed: 0, total: 0 };
  }

  const totalTests = withScores.reduce(
    (acc, i) => acc + (i.automatedScore?.total ?? 0),
    0
  );
  const passedTests = withScores.reduce(
    (acc, i) => acc + (i.automatedScore?.passed ?? 0),
    0
  );

  return {
    passRate: totalTests > 0 ? passedTests / totalTests : 0,
    passed: passedTests,
    total: totalTests,
  };
}

/**
 * Computes pass rate from a single automated score.
 */
export function computeItemPassRate(score: AutomatedScore | undefined): number {
  if (!score || score.total === 0) return 0;
  return score.passed / score.total;
}

/**
 * Groups items by model name.
 */
export function groupByModel(
  items: MatrixItemResult[]
): Map<string, MatrixItemResult[]> {
  return items.reduce((map, item) => {
    const group = map.get(item.model) || [];
    group.push(item);
    map.set(item.model, group);
    return map;
  }, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by harness name.
 */
export function groupByHarness(
  items: MatrixItemResult[]
): Map<string, MatrixItemResult[]> {
  return items.reduce((map, item) => {
    const group = map.get(item.harness) || [];
    group.push(item);
    map.set(item.harness, group);
    return map;
  }, new Map<string, MatrixItemResult[]>());
}

/**
 * Groups items by test name.
 */
export function groupByTest(
  items: MatrixItemResult[]
): Map<string, MatrixItemResult[]> {
  return items.reduce((map, item) => {
    const group = map.get(item.test) || [];
    group.push(item);
    map.set(item.test, group);
    return map;
  }, new Map<string, MatrixItemResult[]>());
}

/** Timing statistics */
export interface TimingStats {
  min: number;
  max: number;
  median: number;
  mean: number;
  p90: number;
  count: number;
}

/**
 * Computes timing statistics from generation durations.
 * @param items - Matrix items with generation data
 * @returns Timing stats or null if no timing data
 */
export function computeTimingStats(items: MatrixItemResult[]): TimingStats | null {
  const durations = items
    .map((i) => i.generation?.durationMs)
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);

  if (durations.length === 0) return null;

  const sum = durations.reduce((a, b) => a + b, 0);
  const p90Index = Math.floor(durations.length * 0.9);

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    median: durations[Math.floor(durations.length / 2)],
    mean: sum / durations.length,
    p90: durations[p90Index] || durations[durations.length - 1],
    count: durations.length,
  };
}

/** Frontier eval statistics */
export interface FrontierStats {
  avgScore: number;
  minScore: number;
  maxScore: number;
  count: number;
}

/**
 * Computes frontier eval statistics.
 * @param items - Matrix items with frontier eval data
 * @returns Frontier stats or null if no eval data
 */
export function computeFrontierStats(items: MatrixItemResult[]): FrontierStats | null {
  const scores = items
    .map((i) => i.frontierEval?.score)
    .filter((s): s is number => s !== undefined);

  if (scores.length === 0) return null;

  const sum = scores.reduce((a, b) => a + b, 0);

  return {
    avgScore: sum / scores.length,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    count: scores.length,
  };
}

/** Dimension breakdown for charts */
export interface DimensionBreakdown {
  name: string;
  passRate: number;
  passed: number;
  total: number;
  count: number; // number of items in this group
}

/**
 * Computes pass rate breakdown by a dimension (model/harness/test).
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @returns Array of breakdowns sorted by pass rate descending
 */
export function computeBreakdown(
  items: MatrixItemResult[],
  groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>
): DimensionBreakdown[] {
  const groups = groupFn(items);
  const breakdowns: DimensionBreakdown[] = [];

  for (const [name, groupItems] of groups) {
    const { passRate, passed, total } = computePassRate(groupItems);
    breakdowns.push({
      name,
      passRate,
      passed,
      total,
      count: groupItems.length,
    });
  }

  return breakdowns.sort((a, b) => b.passRate - a.passRate);
}

/**
 * Computes comparison between two runs.
 * Mirrors logic from src/results/compare.ts in CLI.
 * @param runA - First run (baseline)
 * @param runB - Second run (comparison)
 * @returns Compare result with matched items and deltas
 */
export function compareRuns(
  runA: { runId: string; startedAt: string; items: MatrixItemResult[] },
  runB: { runId: string; startedAt: string; items: MatrixItemResult[] }
): CompareResult {
  // Create lookup map for run A
  const mapA = new Map<string, MatrixItemResult>();
  for (const item of runA.items) {
    const key = `${item.model}|${item.harness}|${item.test}|${item.passType}`;
    mapA.set(key, item);
  }

  const matched: MatchedItem[] = [];
  const onlyInB: MatrixItemResult[] = [];

  // Process run B items
  for (const itemB of runB.items) {
    const key = `${itemB.model}|${itemB.harness}|${itemB.test}|${itemB.passType}`;
    const itemA = mapA.get(key);

    if (itemA) {
      // Matched - compute deltas
      mapA.delete(key);

      const statusDelta =
        itemA.status !== itemB.status
          ? { a: itemA.status, b: itemB.status }
          : null;

      const scoreDelta =
        itemA.automatedScore && itemB.automatedScore
          ? {
              passedDelta: itemB.automatedScore.passed - itemA.automatedScore.passed,
              failedDelta: itemB.automatedScore.failed - itemA.automatedScore.failed,
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
    } else {
      onlyInB.push(itemB);
    }
  }

  // Remaining items in mapA are only in A
  const onlyInA = Array.from(mapA.values());

  // Compute summary
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

  // Compute overall scoring delta
  const passRateA = computePassRate(runA.items);
  const passRateB = computePassRate(runB.items);
  const scoringDelta =
    passRateA.total > 0 || passRateB.total > 0
      ? {
          passRateDelta: passRateB.passRate - passRateA.passRate,
          totalTestsDelta: passRateB.total - passRateA.total,
        }
      : null;

  // Compute overall frontier delta
  const frontierA = computeFrontierStats(runA.items);
  const frontierB = computeFrontierStats(runB.items);
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
      statusChanges: { improved, regressed },
      scoringDelta,
      frontierEvalDelta,
    },
    matched,
    onlyInA,
    onlyInB,
  };
}
