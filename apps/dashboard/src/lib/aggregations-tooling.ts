/**
 * Purpose: Tooling-aware aggregation utilities (tool-missing, composite metrics).
 * Exports: inferToolHarnesses, computeToolUseStats, computeToolScoreBreakdown, partitionToolSmoke, computeCompositeMetrics
 *
 * Invariants:
 * - Tool success is computed only on harnesses inferred to require tools
 * - Score pass rates typically exclude tool-smoke unless explicitly analyzing it
 */

import type { MatrixItemResult } from "./types";
import { TOOL_SMOKE_TEST_SLUG } from "./types";
import { computePassRate } from "./aggregations-core";

/** Tool usage statistics. */
export interface ToolUseStats {
  totalItems: number;
  toolMissing: number;
  toolSuccessRate: number;
}

/**
 * Infers which harnesses are expected to use tools.
 *
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
 *
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

/** Tool vs score breakdown row. */
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
 *
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
 * Separates tool-smoke items from regular items for separate analysis.
 *
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
    if (item.test === TOOL_SMOKE_TEST_SLUG) {
      toolSmoke.push(item);
    } else {
      regular.push(item);
    }
  }

  return { toolSmoke, regular };
}

/** Composite metrics for a group (pass rate + tool success + frontier). */
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
 * Computes composite metrics for grouped items and sorts by effectiveScore.
 *
 * Weights:
 * - passRate (40%)
 * - completionRate (30%)
 * - toolSuccessRate (30%)
 *
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
    const nonToolSmoke =
      name === TOOL_SMOKE_TEST_SLUG
        ? groupItems
        : groupItems.filter((item) => item.test !== TOOL_SMOKE_TEST_SLUG);
    const { passRate, passed, total } = computePassRate(nonToolSmoke);

    const totalItems = groupItems.length;
    const completedItems = groupItems.filter((i) => i.status === "completed").length;
    const completionRate = totalItems > 0 ? completedItems / totalItems : 0;

    const toolItems = groupItems.filter((item) => toolHarnesses.has(item.harness));
    const toolMissing = toolItems.reduce((acc, item) => {
      const failureType = item.generationFailure?.type ?? item.generation?.failureType;
      return failureType === "tool_missing" ? acc + 1 : acc;
    }, 0);
    const toolTotal = toolItems.length;
    const toolSuccessRate = toolTotal > 0 ? (toolTotal - toolMissing) / toolTotal : 0;

    const frontierScores = groupItems
      .map((i) => i.frontierEval?.score)
      .filter((s): s is number => s !== undefined);
    const frontierAvg =
      frontierScores.length > 0
        ? frontierScores.reduce((a, b) => a + b, 0) / frontierScores.length
        : null;

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

