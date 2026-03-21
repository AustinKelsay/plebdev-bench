/**
 * Purpose: Zod schemas for dashboard API boundary validation.
 * Exports: RunResultSchema, RunPlanSchema, RunListItemSchema, RunListSchema, DashboardCheckpointSummarySchema, DashboardIndexSchema, DashboardIndexLegacyOrV2Schema, LeaderboardAggregateSchema
 *
 * These schemas validate JSON fetched from the results directory.
 * They mirror the CLI schemas but are kept local to avoid cross-package imports.
 */
import { z } from "zod";

/** Pass type schema. */
const PassTypeSchema = z.enum(["blind", "informed"]);

/** Item status schema. */
const ItemStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

/** Generation failure type schema. */
const GenerationFailureTypeSchema = z.enum([
	"timeout",
	"api_error",
	"tool_missing",
	"harness_error",
	"prompt_not_found",
	"unknown",
]);

/** Scoring failure type schema. */
const ScoringFailureTypeSchema = z.enum([
	"no_spec",
	"extraction",
	"spec_load",
	"import",
	"missing_export",
	"factory_init_failed",
	"export_validation",
	"test_execution",
	"unknown",
]);

/** Frontier eval failure type schema. */
const FrontierEvalFailureTypeSchema = z.enum([
	"timeout",
	"auth_error",
	"rate_limited",
	"http_error",
	"invalid_response",
	"parse_error",
	"truncated",
	"unknown",
]);

/** Verification status schema. */
const VerificationStatusSchema = z.enum([
	"self_reported",
	"verified",
	"rejected",
]);

/** Generation result schema. */
const GenerationResultSchema = z.object({
	success: z.boolean(),
	output: z.string().optional(),
	error: z.string().optional(),
	failureType: GenerationFailureTypeSchema.optional(),
	durationMs: z.number(),
	promptTokens: z.number().optional(),
	completionTokens: z.number().optional(),
	codeFilePath: z.string().optional(),
	sourcePathToken: z.string().optional(),
});

/** Automated score schema. */
const AutomatedScoreSchema = z.object({
	passed: z.number(),
	failed: z.number(),
	total: z.number(),
});

/** Frontier eval schema. */
const FrontierEvalSchema = z.object({
	score: z.number().min(1).max(10),
	reasoning: z.string(),
	model: z.string(),
	latencyMs: z.number().optional(),
});

/** Scoring metrics schema. */
const ScoringMetricsSchema = z.object({
	durationMs: z.number(),
});

/** Benchmark checkpoint schema. */
const BenchmarkCheckpointSchema = z.object({
	checkpointId: z.string(),
	algorithm: z.string(),
	manifestHash: z.string(),
	assetCount: z.number(),
	computedAt: z.string(),
});

/** Runtime environment schema. */
const RuntimeEnvironmentSchema = z.object({
	platform: z.string(),
	bunVersion: z.string(),
});

/** Observed accelerator kind schema. */
const ObservedAcceleratorKindSchema = z.enum([
	"integrated",
	"discrete",
	"unknown",
]);

/** Observed accelerator schema. */
const ObservedAcceleratorSchema = z.object({
	vendor: z.string().optional(),
	modelRaw: z.string(),
	memoryBytes: z.number().optional(),
	backend: z.string().optional(),
	kind: ObservedAcceleratorKindSchema,
});

/** Accelerator detection status schema. */
const AcceleratorDetectionStatusSchema = z.enum([
	"detected",
	"none_detected",
	"unavailable",
]);

/** Accelerator detection schema. */
const AcceleratorDetectionSchema = z.object({
	status: AcceleratorDetectionStatusSchema,
	detail: z.string().optional(),
});

/** Hardware profile schema. */
const HardwareProfileSchema = z.object({
	platform: z.string(),
	arch: z.string(),
	osRelease: z.string(),
	cpuModelRaw: z.string(),
	cpuVendor: z.string().optional(),
	physicalCores: z.number().optional(),
	logicalCores: z.number(),
	totalMemoryBytes: z.number(),
	accelerators: z.array(ObservedAcceleratorSchema),
	acceleratorDetection: AcceleratorDetectionSchema,
});

/** Normalized machine profile schema. */
const NormalizedMachineProfileSchema = z.object({
	platformFamily: z.enum(["macos", "linux", "windows", "unknown"]),
	arch: z.string(),
	cpuVendor: z.string(),
	cpuModelKey: z.string(),
	physicalCores: z.number().optional(),
	logicalCores: z.number(),
	memoryGiB: z.number(),
	acceleratorKey: z.string(),
	acceleratorMemoryGiB: z.number().optional(),
	acceleratorCount: z.number(),
});

/** Machine profile schema. */
const MachineProfileSchema = z.object({
	instanceId: z.string(),
	instanceIdSource: z.enum([
		"config",
		"env",
		"generated",
		"legacy_profile_id",
	]),
	displayLabel: z.string().optional(),
	profileKey: z.string(),
	profileLabel: z.string(),
	normalizedProfile: NormalizedMachineProfileSchema,
	observedHardware: HardwareProfileSchema,
});

/** Run provenance schema. */
const RunProvenanceSchema = z.object({
	verificationStatus: VerificationStatusSchema,
	source: z.string(),
	submittedBy: z.string().optional(),
	submittedAt: z.string().optional(),
	notes: z.string().optional(),
});

/** Generation failure schema. */
const GenerationFailureSchema = z.object({
	type: GenerationFailureTypeSchema,
	message: z.string(),
});

/** Scoring failure schema. */
const ScoringFailureSchema = z.object({
	type: ScoringFailureTypeSchema,
	message: z.string(),
});

/** Frontier eval failure schema. */
const FrontierEvalFailureSchema = z.object({
	type: FrontierEvalFailureTypeSchema,
	message: z.string(),
	status: z.number().optional(),
	latencyMs: z.number().optional(),
	model: z.string().optional(),
	attempts: z.number().optional(),
});

/** Matrix item result schema. */
const MatrixItemResultSchema = z.object({
	id: z.string(),
	runtime: z.string(),
	model: z.string(),
	modelAlias: z.string().optional(),
	harness: z.string(),
	test: z.string(),
	passType: PassTypeSchema,
	status: ItemStatusSchema,
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	generation: GenerationResultSchema.optional(),
	generationFailure: GenerationFailureSchema.optional(),
	automatedScore: AutomatedScoreSchema.optional(),
	scoringMetrics: ScoringMetricsSchema.optional(),
	scoringFailure: ScoringFailureSchema.optional(),
	frontierEval: FrontierEvalSchema.optional(),
	frontierEvalFailure: FrontierEvalFailureSchema.optional(),
});

/** Run summary schema. */
const RunSummarySchema = z.object({
	total: z.number(),
	completed: z.number(),
	failed: z.number(),
	pending: z.number(),
});

/** Run result schema (run.json). */
export const RunResultSchema = z.object({
	schemaVersion: z.string(),
	runId: z.string(),
	machine: MachineProfileSchema.optional(),
	benchmarkCheckpoint: BenchmarkCheckpointSchema.optional(),
	provenance: RunProvenanceSchema.optional(),
	startedAt: z.string(),
	completedAt: z.string(),
	durationMs: z.number(),
	summary: RunSummarySchema,
	items: z.array(MatrixItemResultSchema),
});

/** Matrix item schema (for plan). */
const MatrixItemSchema = z.object({
	id: z.string(),
	runtime: z.string(),
	model: z.string(),
	modelAlias: z.string().optional(),
	harness: z.string(),
	test: z.string(),
	passType: PassTypeSchema,
});

/** Run plan schema (plan.json). */
export const RunPlanSchema = z.object({
	schemaVersion: z.string(),
	runId: z.string(),
	createdAt: z.string(),
	runtimeEnvironment: RuntimeEnvironmentSchema.optional(),
	machine: MachineProfileSchema.optional(),
	benchmarkCheckpoint: BenchmarkCheckpointSchema.optional(),
	provenance: RunProvenanceSchema.optional(),
	// Legacy pre-0.3.0 field
	environment: z
		.object({
			platform: z.string(),
			bunVersion: z.string(),
		})
		.optional(),
	config: z.object({
		ollamaBaseUrl: z.string(),
		vllmBaseUrl: z.string(),
		generateTimeoutMs: z.number(),
		passTypes: z.array(PassTypeSchema),
	}),
	items: z.array(MatrixItemSchema),
	summary: z.object({
		totalItems: z.number(),
		runtimes: z.number(),
		models: z.number(),
		harnesses: z.number(),
		tests: z.number(),
	}),
});

/** Run list item schema (index.json entries). */
export const RunListItemSchema = z.object({
	runId: z.string(),
	startedAt: z.string(),
	completedAt: z.string(),
	durationMs: z.number(),
	summary: RunSummarySchema,
	checkpointId: z.string().optional(),
	machineProfileKey: z.string().optional(),
	machineProfileId: z.string().optional(),
	machineProfileLabel: z.string().optional(),
	machineLabel: z.string().optional(),
	machineInstanceId: z.string().optional(),
	machineDisplayLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema.optional(),
	isLegacy: z.boolean().optional(),
});

/** Array of run list items (legacy index.json format). */
export const RunListSchema = z.array(RunListItemSchema);

/** Checkpoint summary schema for index metadata. */
export const DashboardCheckpointSummarySchema = z.object({
	checkpointId: z.string(),
	runCount: z.number(),
	rawItemCount: z.number(),
	machineCount: z.number(),
	instanceCount: z.number(),
	latestRunAt: z.string(),
});

/** V2 dashboard index schema. */
export const DashboardIndexSchema = z.object({
	schemaVersion: z.literal(2),
	generatedAt: z.string(),
	latestCheckpointId: z.string().nullable(),
	runs: z.array(RunListItemSchema),
	checkpoints: z.array(DashboardCheckpointSummarySchema),
});

/** Index schema with backward compatibility for legacy array format. */
export const DashboardIndexLegacyOrV2Schema = z.union([
	RunListSchema,
	DashboardIndexSchema,
]);

/** Aggregated leaderboard item schema. */
const LeaderboardAggregatedItemSchema = MatrixItemResultSchema.extend({
	machineProfileKey: z.string(),
	machineProfileId: z.string().optional(),
	machineProfileLabel: z.string().optional(),
	machineLabel: z.string().optional(),
	machineInstanceId: z.string().optional(),
	machineDisplayLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema,
	sourceRunId: z.string(),
	sourceCompletedAt: z.string(),
});

/** Aggregated machine summary schema. */
const LeaderboardMachineSummarySchema = z.object({
	machineProfileKey: z.string(),
	machineProfileId: z.string().optional(),
	machineProfileLabel: z.string().optional(),
	machineLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema,
	runCount: z.number(),
	itemCount: z.number(),
	instanceCount: z.number(),
});

/** Aggregated summary counters schema. */
const LeaderboardAggregateSummarySchema = z.object({
	runsConsidered: z.number(),
	runsMatched: z.number(),
	rawItems: z.number(),
	dedupedItems: z.number(),
	machines: z.number(),
	instances: z.number(),
	automatedScoreItems: z.number(),
	frontierEvalItems: z.number(),
});

/** Leaderboard aggregate payload schema. */
export const LeaderboardAggregateSchema = z.object({
	schemaVersion: z.literal(2),
	generatedAt: z.string(),
	checkpointId: z.string(),
	summary: LeaderboardAggregateSummarySchema,
	machines: z.array(LeaderboardMachineSummarySchema),
	items: z.array(LeaderboardAggregatedItemSchema),
});
