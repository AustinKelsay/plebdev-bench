/**
 * Purpose: Dashboard data types mirroring CLI schemas.
 * These should stay in sync with src/schemas/ in the CLI.
 * Source of truth: src/schemas/result.schema.ts, plan.schema.ts, common.schema.ts
 */

import type {
	ArtifactRuntimeName,
	ModelExclusion,
	SignalAssessmentReason as SharedSignalAssessmentReason,
	TestCategory,
} from "../../../../src/schemas/index.js";
export type { SignalAssessmentReason } from "../../../../src/schemas/index.js";

/** Pass type for benchmark items */
export type PassType = "blind" | "informed";

/** Execution status for matrix items */
export type ItemStatus = "pending" | "running" | "completed" | "failed";

/** Generation failure types */
export type GenerationFailureType =
	| "timeout"
	| "api_error"
	| "tool_missing"
	| "harness_error"
	| "prompt_not_found"
	| "unknown";

/** Scoring failure types */
export type ScoringFailureType =
	| "no_spec"
	| "extraction"
	| "spec_load"
	| "import"
	| "missing_export"
	| "factory_init_failed"
	| "export_validation"
	| "test_execution"
	| "unknown";

/** Frontier eval failure types */
export type FrontierEvalFailureType =
	| "timeout"
	| "auth_error"
	| "rate_limited"
	| "http_error"
	| "invalid_response"
	| "parse_error"
	| "truncated"
	| "unknown";

/** Verification status for run provenance */
export type VerificationStatus = "self_reported" | "verified" | "rejected";

/** Item-level signal quality classification */
export type SignalAssessmentClassification = "trustworthy" | "tainted";

/** Item-level benchmark signal assessment */
export interface SignalAssessment {
	classification: SignalAssessmentClassification;
	reasons: SharedSignalAssessmentReason[];
}

/** Resolution source for canonical model-profile metadata */
export type ModelProfileResolutionSource =
	| "configured_profile"
	| "legacy_alias"
	| "runtime_name";

/** Runtime-agnostic canonical model identity */
export interface CanonicalModelProfile {
	profileKey: string;
	profileLabel: string;
	family: string;
	parametersBillions?: number;
	parameterScaleLabel?: string;
	provider?: string;
	tuning?: string;
}

/** Runtime-specific model artifact metadata */
export interface ModelVariant {
	variantKey: string;
	variantLabel: string;
	runtime: ArtifactRuntimeName;
	runtimeModelName: string;
	format?: string;
	quantization?: string;
	sourceId?: string;
}

/** Canonical model-profile snapshot attached to plan/result items */
export interface ModelProfile {
	canonical: CanonicalModelProfile;
	variant: ModelVariant;
	resolutionSource: ModelProfileResolutionSource;
}

/** Generation failure record */
export interface GenerationFailure {
	type: GenerationFailureType;
	message: string;
}

/** Scoring failure record */
export interface ScoringFailure {
	type: ScoringFailureType;
	message: string;
}

/** Frontier eval failure record */
export interface FrontierEvalFailure {
	type: FrontierEvalFailureType;
	message: string;
	status?: number;
	latencyMs?: number;
	model?: string;
	attempts?: number;
}

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
	codeFilePath?: string;
	sourcePathToken?: string;
}

/** Scoring execution metrics */
export interface ScoringMetrics {
	durationMs: number;
}

/** Benchmark checkpoint identity metadata */
export interface BenchmarkCheckpoint {
	checkpointId: string;
	algorithm: string;
	manifestHash: string;
	assetCount: number;
	computedAt: string;
}

/** Runtime environment metadata */
export interface RuntimeEnvironment {
	platform: string;
	bunVersion: string;
}

/** Accelerator detection status for observed hardware */
export type AcceleratorDetectionStatus =
	| "detected"
	| "none_detected"
	| "unavailable";

/** Observed accelerator kind */
export type ObservedAcceleratorKind = "integrated" | "discrete" | "unknown";

/** Observed accelerator metadata */
export interface ObservedAccelerator {
	vendor?: string;
	modelRaw: string;
	memoryBytes?: number;
	backend?: string;
	count?: number;
	kind: ObservedAcceleratorKind;
}

/** Accelerator probe status */
export interface AcceleratorDetection {
	status: AcceleratorDetectionStatus;
	detail?: string;
}

/** Sanitized observed machine hardware metadata */
export interface HardwareProfile {
	platform: string;
	arch: string;
	osRelease: string;
	cpuModelRaw: string;
	cpuVendor?: string;
	physicalCores?: number;
	logicalCores: number;
	totalMemoryBytes: number;
	accelerators: ObservedAccelerator[];
	acceleratorDetection: AcceleratorDetection;
}

/** Canonical normalized machine profile used for aggregation */
export interface NormalizedMachineProfile {
	platformFamily: "macos" | "linux" | "windows" | "unknown";
	arch: string;
	cpuVendor: string;
	cpuModelKey: string;
	physicalCores?: number;
	logicalCores: number;
	memoryGiB: number;
	acceleratorKey: string;
	acceleratorSummary?: string[];
	acceleratorMemoryGiB?: number;
	acceleratorCount?: number;
}

/** Source used to resolve a machine instance identifier. */
export type InstanceIdSource =
	| "config"
	| "env"
	| "generated"
	| "legacy_profile_id";

/** Machine profile metadata for aggregation */
export interface MachineProfile {
	instanceId: string;
	instanceIdSource: InstanceIdSource;
	displayLabel?: string;
	profileKey: string;
	profileLabel: string;
	normalizedProfile: NormalizedMachineProfile;
	observedHardware: HardwareProfile;
}

/** Provenance metadata attached to plans/runs */
export interface RunProvenance {
	verificationStatus: VerificationStatus;
	source: string;
	submittedBy?: string;
	submittedAt?: string;
	notes?: string;
}

/** Single matrix item in plan */
export interface MatrixItem {
	id: string;
	runtime: string;
	model: string;
	modelAlias?: string;
	modelProfile?: ModelProfile;
	harness: string;
	test: string;
	category?: TestCategory;
	passType: PassType;
}

/** Single matrix item execution result */
export interface MatrixItemResult extends MatrixItem {
	status: ItemStatus;
	startedAt?: string;
	completedAt?: string;
	generation?: GenerationResult;
	generationFailure?: GenerationFailure;
	automatedScore?: AutomatedScore;
	scoringMetrics?: ScoringMetrics;
	scoringFailure?: ScoringFailure;
	frontierEval?: FrontierEval;
	frontierEvalFailure?: FrontierEvalFailure;
	signalAssessment?: SignalAssessment;
}

/** Legacy run plan environment info (pre-0.3.0 artifacts) */
export interface LegacyEnvironment {
	platform: string;
	bunVersion: string;
}

/** Run plan configuration */
export interface PlanConfig {
	ollamaBaseUrl: string;
	generateTimeoutMs: number;
	gooseMaxTurns?: number;
	gooseRetryMaxTurns?: number;
	gooseWorkspaceMaxTurns?: number;
	gooseWorkspaceRetryMaxTurns?: number;
	categories?: TestCategory[];
	passTypes: PassType[];
}

/** Full run plan (plan.json) */
export interface RunPlan {
	schemaVersion: string;
	runId: string;
	createdAt: string;
	runtimeEnvironment?: RuntimeEnvironment;
	machine?: MachineProfile;
	benchmarkCheckpoint?: BenchmarkCheckpoint;
	provenance?: RunProvenance;
	/** Legacy field for pre-0.3.0 plans */
	environment?: LegacyEnvironment;
	config: PlanConfig;
	items: MatrixItem[];
	modelExclusions?: ModelExclusion[];
	summary: {
		totalItems: number;
		runtimes: number;
		models: number;
		harnesses: number;
		tests: number;
		categories?: number;
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
	machine?: MachineProfile;
	benchmarkCheckpoint?: BenchmarkCheckpoint;
	provenance?: RunProvenance;
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
	checkpointId?: string;
	machineProfileKey?: string;
	/** Deprecated compatibility alias for machineProfileKey. */
	machineProfileId?: string;
	machineProfileLabel?: string;
	machineLabel?: string;
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	verificationStatus?: VerificationStatus;
	isLegacy?: boolean;
}

/** Per-checkpoint summary entry in dashboard index metadata */
export interface DashboardCheckpointSummary {
	checkpointId: string;
	runCount: number;
	rawItemCount: number;
	machineCount: number;
	instanceCount: number;
	latestRunAt: string;
}

/** Dashboard index format v3 */
export interface DashboardIndex {
	schemaVersion: 3;
	generatedAt: string;
	latestCheckpointId: string | null;
	runs: RunListItem[];
	checkpoints: DashboardCheckpointSummary[];
}

/** Aggregated leaderboard item from checkpoint aggregate payloads */
export interface LeaderboardAggregatedItem extends MatrixItemResult {
	machineProfileKey: string;
	/** Deprecated compatibility alias for machineProfileKey. */
	machineProfileId?: string;
	machineProfileLabel?: string;
	machineLabel?: string;
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	verificationStatus: VerificationStatus;
	sourceRunId: string;
	sourceCompletedAt: string;
}

/** Per-machine summary in checkpoint aggregate payload */
export interface LeaderboardMachineSummary {
	machineProfileKey: string;
	/** Deprecated compatibility alias for machineProfileKey. */
	machineProfileId?: string;
	machineProfileLabel?: string;
	machineLabel?: string;
	verificationStatus: VerificationStatus;
	runCount: number;
	itemCount: number;
	instanceCount: number;
}

/** Aggregate summary counters for leaderboard payload */
export interface LeaderboardAggregateSummary {
	runsConsidered: number;
	runsMatched: number;
	rawItems: number;
	dedupedItems: number;
	machines: number;
	instances: number;
	automatedScoreItems: number;
	frontierEvalItems: number;
}

/** Checkpoint aggregate payload rendered by leaderboard page */
export interface LeaderboardAggregate {
	schemaVersion: 2;
	generatedAt: string;
	checkpointId: string;
	summary: LeaderboardAggregateSummary;
	machines: LeaderboardMachineSummary[];
	items: LeaderboardAggregatedItem[];
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
	runtime: string;
	model: string;
	harness: string;
	test: string;
	passType: PassType;
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

// ============================================================
// Code extraction and tool-smoke types
// ============================================================

/** Code extraction methods used by the scorer */
export type ExtractionMethod =
	| "markdown-ts"
	| "markdown-any"
	| "heuristic"
	| "raw"
	| "file";

/** Test slug used for tool-smoke preflight tests */
export const TOOL_SMOKE_TEST_SLUG = "tool-smoke";

/** Checks if an item is a tool-smoke test */
export function isToolSmokeItem(item: { test: string }): boolean {
	return item.test === TOOL_SMOKE_TEST_SLUG;
}
