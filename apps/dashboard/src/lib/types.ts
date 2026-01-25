/**
 * Purpose: Dashboard data types mirroring CLI schemas.
 * These should stay in sync with src/schemas/ in the CLI.
 * Source of truth: src/schemas/result.schema.ts, plan.schema.ts, common.schema.ts
 */

/** Pass type for benchmark items */
export type PassType = "blind" | "informed";

/** Execution status for matrix items */
export type ItemStatus = "pending" | "running" | "completed" | "failed";

/** Generation failure types */
export type GenerationFailureType =
  | "timeout"
  | "api_error"
  | "harness_error"
  | "prompt_not_found"
  | "unknown";

/** Scoring failure types */
export type ScoringFailureType =
  | "no_spec"
  | "extraction"
  | "spec_load"
  | "import"
  | "export_validation"
  | "test_execution"
  | "unknown";

/** Automated test scoring result */
export interface AutomatedScore {
  passed: number;
  failed: number;
  total: number;
}

/** Frontier model evaluation result */
export interface FrontierEval {
  score: number; // 1-10
  reasoning: string;
  model: string;
  latencyMs?: number;
}

/** Code generation result from harness */
export interface GenerationResult {
  success: boolean;
  output?: string;
  error?: string;
  failureType?: GenerationFailureType;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

/** Scoring execution metrics */
export interface ScoringMetrics {
  durationMs: number;
}

/** Single matrix item in plan */
export interface MatrixItem {
  id: string;
  model: string;
  harness: string;
  test: string;
  passType: PassType;
}

/** Single matrix item execution result */
export interface MatrixItemResult extends MatrixItem {
  status: ItemStatus;
  startedAt?: string;
  completedAt?: string;
  generation?: GenerationResult;
  automatedScore?: AutomatedScore;
  scoringMetrics?: ScoringMetrics;
  frontierEval?: FrontierEval;
}

/** Run plan environment info */
export interface Environment {
  platform: string;
  bunVersion: string;
  hostname: string;
}

/** Run plan configuration */
export interface PlanConfig {
  ollamaBaseUrl: string;
  generateTimeoutMs: number;
  passTypes: PassType[];
}

/** Full run plan (plan.json) */
export interface RunPlan {
  schemaVersion: string;
  runId: string;
  createdAt: string;
  environment: Environment;
  config: PlanConfig;
  items: MatrixItem[];
  summary: {
    totalItems: number;
    models: number;
    harnesses: number;
    tests: number;
  };
}

/** Run result summary */
export interface RunSummary {
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

/** Full run result (run.json) */
export interface RunResult {
  schemaVersion: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: RunSummary;
  items: MatrixItemResult[];
}

/** Run list item for index */
export interface RunListItem {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: RunSummary;
}

// ============================================================
// Compare types (mirroring src/results/compare.ts)
// ============================================================

/** Score delta between two items */
export interface ScoreDelta {
  passedDelta: number;
  failedDelta: number;
  totalDelta: number;
  passRateDelta: number;
}

/** Frontier eval delta */
export interface EvalDelta {
  scoreDelta: number;
}

/** Deltas between matched items */
export interface ItemDeltas {
  status: { a: ItemStatus; b: ItemStatus } | null;
  automatedScore: ScoreDelta | null;
  frontierEval: EvalDelta | null;
  durationMs: number | null;
}

/** Matched item in compare result */
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

/** Compare result summary */
export interface CompareSummary {
  totalMatched: number;
  totalOnlyInA: number;
  totalOnlyInB: number;
  statusChanges: {
    improved: number;
    regressed: number;
  };
  scoringDelta: {
    passRateDelta: number;
    totalTestsDelta: number;
  } | null;
  frontierEvalDelta: {
    avgScoreDelta: number;
  } | null;
}

/** Full compare result */
export interface CompareResult {
  runA: { runId: string; timestamp: string };
  runB: { runId: string; timestamp: string };
  summary: CompareSummary;
  matched: MatchedItem[];
  onlyInA: MatrixItemResult[];
  onlyInB: MatrixItemResult[];
}
