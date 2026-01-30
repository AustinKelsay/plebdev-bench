/**
 * Purpose: Compute aggregated statistics from run data.
 * Exports: computePassRate, groupByModel, groupByHarness, computeTimingStats, etc.
 */
import type { MatrixItemResult, AutomatedScore, MatchedItem, CompareResult } from "./types";
import { TOOL_SMOKE_TEST_SLUG } from "./types";

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

/**
 * Groups items by combined model + harness name.
 * @param items - Matrix items
 * @returns Map keyed by "model · harness"
 */
export function groupByModelHarness(
  items: MatrixItemResult[]
): Map<string, MatrixItemResult[]> {
  return items.reduce((map, item) => {
    const key = `${item.model} / ${item.harness}`;
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
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

/** Failure counts by type */
export interface FailureStats {
  generationFailures: Map<string, number>;
  scoringFailures: Map<string, number>;
  totalGenerationFailures: number;
  totalScoringFailures: number;
}

/** Tool usage statistics */
export interface ToolUseStats {
  totalItems: number;
  toolMissing: number;
  toolSuccessRate: number;
}

/**
 * Infers which harnesses are expected to use tools.
 * Uses tool-smoke presence and tool_missing failures as signals.
 * @param items - Matrix items
 * @returns Set of harness names with expected tool usage
 */
export function inferToolHarnesses(items: MatrixItemResult[]): Set<string> {
  const toolHarnesses = new Set<string>();

  for (const item of items) {
    const failureType = item.generationFailure?.type ?? item.generation?.failureType;
    if (item.test === TOOL_SMOKE_TEST_SLUG || failureType === "tool_missing") {
      toolHarnesses.add(item.harness);
    }
  }

  return toolHarnesses;
}

/**
 * Computes tool usage statistics for a set of tool-expected items.
 * @param items - Matrix items expected to use tools
 * @returns Tool usage stats
 */
export function computeToolUseStats(items: MatrixItemResult[]): ToolUseStats {
  const totalItems = items.length;
  const toolMissing = items.reduce((acc, item) => {
    const failureType = item.generationFailure?.type ?? item.generation?.failureType;
    return failureType === "tool_missing" ? acc + 1 : acc;
  }, 0);
  const toolSuccessRate =
    totalItems > 0 ? (totalItems - toolMissing) / totalItems : 0;

  return { totalItems, toolMissing, toolSuccessRate };
}

/** Tool vs score breakdown row */
export interface ToolScoreBreakdown {
  name: string;
  toolMissing: number;
  toolTotal: number;
  toolSuccessRate: number;
  scorePassRate: number;
  scorePassed: number;
  scoreTotal: number;
}

/**
 * Computes tool-usage and score breakdown for grouped items.
 * Tool usage is calculated on tool-expected harnesses; scoring excludes tool-smoke.
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @param toolHarnesses - Optional set of tool-expected harnesses
 * @returns Breakdown rows
 */
export function computeToolScoreBreakdown(
  items: MatrixItemResult[],
  groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
  toolHarnesses: Set<string> = inferToolHarnesses(items)
): ToolScoreBreakdown[] {
  const groups = groupFn(items);
  const breakdowns: ToolScoreBreakdown[] = [];

  for (const [name, groupItems] of groups) {
    const toolItems = groupItems.filter((item) => toolHarnesses.has(item.harness));
    const toolMissing = toolItems.reduce((acc, item) => {
      const failureType = item.generationFailure?.type ?? item.generation?.failureType;
      return failureType === "tool_missing" ? acc + 1 : acc;
    }, 0);
    const toolTotal = toolItems.length;
    const toolSuccessRate =
      toolTotal > 0 ? (toolTotal - toolMissing) / toolTotal : 0;

    const nonToolSmoke = groupItems.filter((item) => item.test !== TOOL_SMOKE_TEST_SLUG);
    const { passRate, passed, total } = computePassRate(nonToolSmoke);

    breakdowns.push({
      name,
      toolMissing,
      toolTotal,
      toolSuccessRate,
      scorePassRate: passRate,
      scorePassed: passed,
      scoreTotal: total,
    });
  }

  return breakdowns;
}

/**
 * Computes failure statistics from items.
 * @param items - Matrix items
 * @returns Failure counts grouped by type
 */
export function computeFailureStats(items: MatrixItemResult[]): FailureStats {
  const generationFailures = new Map<string, number>();
  const scoringFailures = new Map<string, number>();

  for (const item of items) {
    if (item.generationFailure) {
      const count = generationFailures.get(item.generationFailure.type) || 0;
      generationFailures.set(item.generationFailure.type, count + 1);
    }
    if (item.scoringFailure) {
      const count = scoringFailures.get(item.scoringFailure.type) || 0;
      scoringFailures.set(item.scoringFailure.type, count + 1);
    }
  }

  return {
    generationFailures,
    scoringFailures,
    totalGenerationFailures: Array.from(generationFailures.values()).reduce(
      (a, b) => a + b,
      0
    ),
    totalScoringFailures: Array.from(scoringFailures.values()).reduce(
      (a, b) => a + b,
      0
    ),
  };
}

/**
 * Separates tool-smoke items from regular items for separate analysis.
 * @param items - Matrix items
 * @returns Object with toolSmoke and regular item arrays
 */
export function partitionToolSmoke(items: MatrixItemResult[]): {
  toolSmoke: MatrixItemResult[];
  regular: MatrixItemResult[];
} {
  const toolSmoke: MatrixItemResult[] = [];
  const regular: MatrixItemResult[] = [];

  for (const item of items) {
    if (item.test === "tool-smoke") {
      toolSmoke.push(item);
    } else {
      regular.push(item);
    }
  }

  return { toolSmoke, regular };
}

/** Composite metrics for a group (pass rate + tool success + frontier) */
export interface CompositeMetrics {
  name: string;
  passRate: number;
  passed: number;
  total: number;
  completionRate: number;
  completedItems: number;
  totalItems: number;
  toolSuccessRate: number;
  toolTotal: number;
  frontierAvg: number | null;
  frontierCount: number;
  effectiveScore: number;
}

/**
 * Computes composite metrics (pass rate + tool success + frontier avg) for grouped items.
 * Sorts by effectiveScore which weights: passRate (40%), completionRate (30%), toolSuccessRate (30%).
 * This prevents models that only complete easy items from ranking above comprehensive performers.
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @param toolHarnesses - Set of harness names expected to use tools
 * @returns Composite metrics per group sorted by effectiveScore
 */
export function computeCompositeMetrics(
  items: MatrixItemResult[],
  groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>,
  toolHarnesses: Set<string> = inferToolHarnesses(items)
): CompositeMetrics[] {
  const groups = groupFn(items);
  const metrics: CompositeMetrics[] = [];

  for (const [name, groupItems] of groups) {
    // Pass rate (exclude tool-smoke, unless we're specifically viewing tool-smoke)
    const nonToolSmoke = name === TOOL_SMOKE_TEST_SLUG
      ? groupItems  // Don't filter when viewing tool-smoke itself
      : groupItems.filter((item) => item.test !== TOOL_SMOKE_TEST_SLUG);
    const { passRate, passed, total } = computePassRate(nonToolSmoke);

    // Completion rate: how many items actually ran successfully
    const totalItems = groupItems.length;
    const completedItems = groupItems.filter((i) => i.status === "completed").length;
    const completionRate = totalItems > 0 ? completedItems / totalItems : 0;

    // Tool success (only for tool-expected harnesses)
    const toolItems = groupItems.filter((item) => toolHarnesses.has(item.harness));
    const toolMissing = toolItems.reduce((acc, item) => {
      const failureType = item.generationFailure?.type ?? item.generation?.failureType;
      return failureType === "tool_missing" ? acc + 1 : acc;
    }, 0);
    const toolTotal = toolItems.length;
    const toolSuccessRate = toolTotal > 0 ? (toolTotal - toolMissing) / toolTotal : 0;

    // Frontier avg
    const frontierScores = groupItems
      .map((i) => i.frontierEval?.score)
      .filter((s): s is number => s !== undefined);
    const frontierAvg =
      frontierScores.length > 0
        ? frontierScores.reduce((a, b) => a + b, 0) / frontierScores.length
        : null;

    // Weighted effective score: passRate (40%) + completionRate (30%) + toolSuccessRate (30%)
    // This ensures models that complete all items and use tools rank higher than
    // models with high pass rates but low completion (e.g., only work on easy harnesses)
    const effectiveScore =
      passRate * 0.4 + completionRate * 0.3 + toolSuccessRate * 0.3;

    metrics.push({
      name,
      passRate,
      passed,
      total,
      completionRate,
      completedItems,
      totalItems,
      toolSuccessRate,
      toolTotal,
      frontierAvg,
      frontierCount: frontierScores.length,
      effectiveScore,
    });
  }

  return metrics.sort((a, b) => b.effectiveScore - a.effectiveScore);
}

/** Blind vs informed breakdown for a group */
export interface BlindInformedBreakdown {
  name: string;
  blindPassRate: number;
  blindPassed: number;
  blindTotal: number;
  informedPassRate: number;
  informedPassed: number;
  informedTotal: number;
  delta: number; // informed - blind
}

/**
 * Computes blind vs informed breakdown by a dimension.
 * @param items - Matrix items
 * @param groupFn - Grouping function
 * @returns Breakdown per group with delta
 */
export function computeBlindInformedBreakdown(
  items: MatrixItemResult[],
  groupFn: (items: MatrixItemResult[]) => Map<string, MatrixItemResult[]>
): BlindInformedBreakdown[] {
  const groups = groupFn(items);
  const breakdowns: BlindInformedBreakdown[] = [];

  for (const [name, groupItems] of groups) {
    // Exclude tool-smoke from analysis
    const nonToolSmoke = groupItems.filter((item) => item.test !== TOOL_SMOKE_TEST_SLUG);
    const blind = nonToolSmoke.filter((item) => item.passType === "blind");
    const informed = nonToolSmoke.filter((item) => item.passType === "informed");

    const blindStats = computePassRate(blind);
    const informedStats = computePassRate(informed);

    // Only include groups that have both blind and informed data
    if (blindStats.total > 0 || informedStats.total > 0) {
      breakdowns.push({
        name,
        blindPassRate: blindStats.passRate,
        blindPassed: blindStats.passed,
        blindTotal: blindStats.total,
        informedPassRate: informedStats.passRate,
        informedPassed: informedStats.passed,
        informedTotal: informedStats.total,
        delta: informedStats.passRate - blindStats.passRate,
      });
    }
  }

  return breakdowns.sort((a, b) => b.delta - a.delta);
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
