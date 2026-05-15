/**
 * Purpose: Zod schemas for dashboard API boundary validation.
 * Exports: RunResultSchema, RunPlanSchema, RunListItemSchema, RunListSchema, MatrixItemResultSchema, DashboardCheckpointSummarySchema, DashboardIndexSchema, DashboardIndexLegacyOrCurrentSchema, LeaderboardAggregateSchema
 *
 * These schemas validate JSON fetched from the results directory.
 * They mirror the CLI schemas but are kept local to avoid cross-package imports.
 */
import { z } from "zod";

/** Pass type schema. */
const PassTypeSchema = z.enum(["blind", "informed"]);

/** Test category schema. */
const TestCategorySchema = z.enum(["coding", "computer-use"]);

/** Runtime name schema. */
const RuntimeNameSchema = z.enum(["ollama", "vllm"]);

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

/** Signal assessment classification schema. */
const SignalAssessmentClassificationSchema = z.enum(["trustworthy", "tainted"]);

/** Signal assessment reason schema. */
const SignalAssessmentReasonSchema = z.enum([
	"output_contract_violation",
	"mixed_prose_salvaged",
	"tool_permission_denied",
	"tool_call_not_executed",
	"confirmation_without_artifact",
	"internal_tool_transcript",
	"agent_requested_input",
]);

/** Signal assessment schema. */
const SignalAssessmentSchema = z
	.object({
		classification: SignalAssessmentClassificationSchema,
		reasons: z.array(SignalAssessmentReasonSchema),
	})
	.superRefine((value, context) => {
		if (value.classification === "tainted" && value.reasons.length === 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reasons"],
				message: "tainted signal assessments must include at least one reason",
			});
		}
		if (value.classification === "trustworthy" && value.reasons.length > 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reasons"],
				message:
					"trustworthy signal assessments must not include taint reasons",
			});
		}
	});

/** Model-profile resolution source schema. */
const ModelProfileResolutionSourceSchema = z.enum([
	"configured_profile",
	"legacy_alias",
	"runtime_name",
]);

/** Canonical model-profile schema. */
const CanonicalModelProfileSchema = z.object({
	profileKey: z.string().min(1),
	profileLabel: z.string().min(1),
	family: z.string().min(1),
	parametersBillions: z.number().positive().optional(),
	parameterScaleLabel: z.string().min(1).optional(),
	provider: z.string().min(1).optional(),
	tuning: z.string().min(1).optional(),
});

/** Runtime-specific model variant schema. */
const ModelVariantSchema = z.object({
	variantKey: z.string().min(1),
	variantLabel: z.string().min(1),
	runtime: RuntimeNameSchema,
	runtimeModelName: z.string().min(1),
	format: z.string().min(1).optional(),
	quantization: z.string().min(1).optional(),
	sourceId: z.string().min(1).optional(),
});

/** Model exclusion reason schema. */
const ModelExclusionReasonSchema = z.literal("non_generative_model");

/** Evidence attached to an excluded discovered model. */
const ModelExclusionEvidenceSchema = z
	.object({
		family: z.string().optional(),
		families: z.array(z.string()).optional(),
		architecture: z.string().optional(),
	})
	.passthrough()
	.optional();

/** Discovered model omitted from a run plan before matrix expansion. */
const ModelExclusionSchema = z
	.object({
		runtime: RuntimeNameSchema,
		model: z.string(),
		reason: ModelExclusionReasonSchema,
		evidence: ModelExclusionEvidenceSchema,
	})
	.passthrough();

/** Resolved model-profile schema. */
const ModelProfileSchema = z.object({
	canonical: CanonicalModelProfileSchema,
	variant: ModelVariantSchema,
	resolutionSource: ModelProfileResolutionSourceSchema,
});

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
const ScoringMetricsSchema = z
	.object({
		durationMs: z.number(),
		scoringDurationMs: z.number().optional(),
		retryGenerationDurationMs: z.number().optional(),
		retryKind: z.enum(["compile-feedback", "opencode-workspace"]).optional(),
		retryReason: z.string().optional(),
		retryAttempted: z.boolean().optional(),
		retryPromoted: z.boolean().optional(),
	})
	.refine(
		(metrics) => {
			const hasAnyRetryField =
				metrics.retryKind !== undefined ||
				metrics.retryReason !== undefined ||
				metrics.retryAttempted !== undefined ||
				metrics.retryPromoted !== undefined ||
				metrics.retryGenerationDurationMs !== undefined;
			if (!hasAnyRetryField) return true;
			if (metrics.retryAttempted === true) {
				return (
					metrics.retryKind !== undefined &&
					typeof metrics.retryReason === "string" &&
					metrics.retryReason.trim().length > 0 &&
					typeof metrics.retryPromoted === "boolean" &&
					typeof metrics.retryGenerationDurationMs === "number" &&
					metrics.retryGenerationDurationMs >= 0
				);
			}
			if (metrics.retryAttempted === false) {
				return (
					metrics.retryKind === undefined &&
					metrics.retryReason === undefined &&
					metrics.retryPromoted === undefined &&
					metrics.retryGenerationDurationMs === undefined
				);
			}
			return false;
		},
		{
			message:
				"retry metrics must be fully absent, or when retryAttempted is true include retryKind, non-empty retryReason, retryPromoted, and non-negative retryGenerationDurationMs; when retryAttempted is false the other retry fields must be absent",
			path: ["retryKind"],
		},
	);

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
	vendor: z.string().min(1).optional(),
	modelRaw: z.string().min(1),
	memoryBytes: z.number().int().positive().optional(),
	backend: z.string().min(1).optional(),
	count: z.number().int().positive().optional(),
	kind: ObservedAcceleratorKindSchema.default("unknown"),
});

/** Accelerator detection status schema. */
const AcceleratorDetectionStatusSchema = z.enum([
	"detected",
	"none_detected",
	"unavailable",
]);

/** Accelerator detection schema. */
const AcceleratorDetectionSchema = z
	.object({
		status: AcceleratorDetectionStatusSchema,
		detail: z.string().min(1).optional(),
	})
	.superRefine((value, context) => {
		if (
			value.status === "unavailable" &&
			(value.detail === undefined || value.detail.trim().length === 0)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["detail"],
				message:
					'AcceleratorDetectionSchema requires detail when status is "unavailable"',
			});
		}
	});

/** Hardware profile schema. */
const HardwareProfileSchema = z
	.object({
		platform: z.string().min(1),
		arch: z.string().min(1),
		osRelease: z.string().min(1),
		cpuModelRaw: z.string().min(1),
		cpuVendor: z.string().min(1).optional(),
		physicalCores: z.number().int().positive().optional(),
		logicalCores: z.number().int().positive(),
		totalMemoryBytes: z.number().int().positive(),
		accelerators: z.array(ObservedAcceleratorSchema).default([]),
		acceleratorDetection: AcceleratorDetectionSchema,
	})
	.superRefine((hardware, context) => {
		if (
			hardware.acceleratorDetection.status === "detected" &&
			hardware.accelerators.length === 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must contain at least one accelerator when acceleratorDetection.status is "detected"',
			});
		}

		if (
			hardware.acceleratorDetection.status === "none_detected" &&
			hardware.accelerators.length > 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must be empty when acceleratorDetection.status is "none_detected"',
			});
		}

		if (
			hardware.acceleratorDetection.status === "unavailable" &&
			hardware.accelerators.length > 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must be empty when acceleratorDetection.status is "unavailable"',
			});
		}
	});

/** Normalized machine profile schema. */
const NormalizedMachineProfileSchema = z.object({
	platformFamily: z.enum(["macos", "linux", "windows", "unknown"]),
	arch: z.string().min(1),
	cpuVendor: z.string().min(1),
	cpuModelKey: z.string().min(1),
	physicalCores: z.number().int().positive().optional(),
	logicalCores: z.number().int().positive(),
	memoryGiB: z.number().int().positive(),
	acceleratorKey: z.string().min(1),
	acceleratorSummary: z.array(z.string().min(1)).optional(),
	acceleratorMemoryGiB: z.number().int().positive().optional(),
	acceleratorCount: z.number().int().nonnegative().optional(),
});

/** Machine profile schema. */
const MachineProfileSchema = z.object({
	instanceId: z.string().min(1),
	instanceIdSource: z.enum(["config", "env", "generated", "legacy_profile_id"]),
	displayLabel: z.string().min(1).optional(),
	profileKey: z.string().min(1),
	profileLabel: z.string().min(1),
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
export const MatrixItemResultSchema = z.object({
	id: z.string(),
	runtime: RuntimeNameSchema,
	model: z.string(),
	modelAlias: z.string().optional(),
	modelProfile: ModelProfileSchema.optional(),
	harness: z.string(),
	test: z.string(),
	category: TestCategorySchema.optional(),
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
	signalAssessment: SignalAssessmentSchema.optional(),
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
const MatrixItemSchema = z
	.object({
		id: z.string(),
		runtime: z.string(),
		model: z.string(),
		modelAlias: z.string().optional(),
		modelProfile: ModelProfileSchema.optional(),
		harness: z.string(),
		test: z.string(),
		category: TestCategorySchema.optional(),
		passType: PassTypeSchema,
	})
	.passthrough();

/**
 * Normalizes dashboard plan payloads with an explicit schemaVersion hook.
 *
 * @param payload - Unknown plan JSON payload
 * @returns Payload to parse without dropping additive fields
 */
function normalizeDashboardRunPlanPayload(payload: unknown): unknown {
	if (
		typeof payload === "object" &&
		payload !== null &&
		!Array.isArray(payload)
	) {
		const schemaVersion = (payload as Record<string, unknown>).schemaVersion;
		if (typeof schemaVersion === "string") {
			// Future dashboard-only migrations should branch on schemaVersion here.
			return payload;
		}
	}
	return payload;
}

/** Run plan schema (plan.json). */
const RunPlanObjectSchema = z
	.object({
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
			.passthrough()
			.optional(),
		config: z
			.object({
				ollamaBaseUrl: z.string(),
				// Legacy plan field. TODO: remove after adding explicit schemaVersion migrations.
				vllmBaseUrl: z.string().optional(),
				generateTimeoutMs: z.number(),
				gooseMaxTurns: z.number().int().positive().optional(),
				gooseRetryMaxTurns: z.number().int().positive().optional(),
				gooseWorkspaceMaxTurns: z.number().int().positive().optional(),
				gooseWorkspaceRetryMaxTurns: z.number().int().positive().optional(),
				categories: z.array(TestCategorySchema).optional(),
				passTypes: z.array(PassTypeSchema),
			})
			.passthrough(),
		items: z.array(MatrixItemSchema),
		modelExclusions: z.array(ModelExclusionSchema).optional(),
		summary: z
			.object({
				totalItems: z.number(),
				runtimes: z.number(),
				models: z.number(),
				harnesses: z.number(),
				tests: z.number(),
				categories: z.number().optional(),
			})
			.passthrough(),
	})
	.passthrough();

/** Run plan schema (plan.json). */
export const RunPlanSchema = z.preprocess(
	normalizeDashboardRunPlanPayload,
	RunPlanObjectSchema,
);

/** Run list item schema (index.json entries). */
export const RunListItemSchema = z.object({
	runId: z.string(),
	startedAt: z.string(),
	completedAt: z.string(),
	durationMs: z.number(),
	summary: RunSummarySchema,
	checkpointId: z.string().optional(),
	machineProfileKey: z.string().optional(),
	// Deprecated compatibility alias for consumers still reading pre-profileKey payloads.
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

/** Legacy v2 checkpoint summary schema. */
const DashboardCheckpointSummaryV2Schema = z.object({
	checkpointId: z.string(),
	runCount: z.number(),
	rawItemCount: z.number(),
	machineCount: z.number(),
	latestRunAt: z.string(),
});

/** Current v3 dashboard index schema. */
export const DashboardIndexSchema = z.object({
	schemaVersion: z.literal(3),
	generatedAt: z.string(),
	latestCheckpointId: z.string().nullable(),
	runs: z.array(RunListItemSchema),
	checkpoints: z.array(DashboardCheckpointSummarySchema),
});

/** Legacy v2 dashboard index schema. */
const DashboardIndexV2Schema = z.object({
	schemaVersion: z.literal(2),
	generatedAt: z.string(),
	latestCheckpointId: z.string().nullable(),
	runs: z.array(RunListItemSchema),
	checkpoints: z.array(DashboardCheckpointSummaryV2Schema),
});

/** Index schema with backward compatibility for legacy array and v2 formats. */
export const DashboardIndexLegacyOrCurrentSchema = z
	.union([RunListSchema, DashboardIndexV2Schema, DashboardIndexSchema])
	.transform((index) => {
		if (Array.isArray(index)) {
			const latestRun = [...index].sort((left, right) =>
				right.startedAt.localeCompare(left.startedAt),
			)[0];
			return {
				schemaVersion: 3 as const,
				generatedAt:
					latestRun?.completedAt ??
					latestRun?.startedAt ??
					new Date(0).toISOString(),
				latestCheckpointId: latestRun?.checkpointId ?? null,
				runs: index,
				checkpoints: [],
			};
		}

		if (index.schemaVersion === 3) {
			return index;
		}

		return {
			schemaVersion: 3 as const,
			generatedAt: index.generatedAt,
			latestCheckpointId: index.latestCheckpointId,
			runs: index.runs,
			checkpoints: index.checkpoints.map((checkpoint) => ({
				...checkpoint,
				instanceCount: checkpoint.machineCount,
			})),
		};
	});

/** Aggregated leaderboard item schema. */
const LeaderboardAggregatedItemSchema = MatrixItemResultSchema.extend({
	machineProfileKey: z.string(),
	// Deprecated compatibility alias for consumers still reading pre-profileKey payloads.
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
	// Deprecated compatibility alias for consumers still reading pre-profileKey payloads.
	machineProfileId: z.string().optional(),
	machineProfileLabel: z.string().optional(),
	machineLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema,
	runCount: z.number(),
	itemCount: z.number(),
	instanceCount: z.number(),
});

/** Legacy v1 aggregated leaderboard item schema. */
const LeaderboardAggregatedItemV1Schema = MatrixItemResultSchema.extend({
	machineProfileId: z.string(),
	machineLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema,
	sourceRunId: z.string(),
	sourceCompletedAt: z.string(),
});

/** Legacy v1 aggregated machine summary schema. */
const LeaderboardMachineSummaryV1Schema = z.object({
	machineProfileId: z.string(),
	machineLabel: z.string().optional(),
	verificationStatus: VerificationStatusSchema,
	runCount: z.number(),
	itemCount: z.number(),
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

/** Legacy v1 aggregate summary counters schema. */
const LeaderboardAggregateSummaryV1Schema = z.object({
	runsConsidered: z.number(),
	runsMatched: z.number(),
	rawItems: z.number(),
	dedupedItems: z.number(),
	machines: z.number(),
	automatedScoreItems: z.number(),
	frontierEvalItems: z.number(),
});

/** Legacy v1 leaderboard aggregate payload schema. */
const LeaderboardAggregateV1Schema = z.object({
	schemaVersion: z.literal(1),
	generatedAt: z.string(),
	checkpointId: z.string(),
	summary: LeaderboardAggregateSummaryV1Schema,
	machines: z.array(LeaderboardMachineSummaryV1Schema),
	items: z.array(LeaderboardAggregatedItemV1Schema),
});

/** Current v2 leaderboard aggregate payload schema. */
const LeaderboardAggregateV2Schema = z.object({
	schemaVersion: z.literal(2),
	generatedAt: z.string(),
	checkpointId: z.string(),
	summary: LeaderboardAggregateSummarySchema,
	machines: z.array(LeaderboardMachineSummarySchema),
	items: z.array(LeaderboardAggregatedItemSchema),
});

/** Leaderboard aggregate payload schema. */
export const LeaderboardAggregateSchema = z
	.union([LeaderboardAggregateV1Schema, LeaderboardAggregateV2Schema])
	.transform((aggregate) => {
		if (aggregate.schemaVersion === 2) {
			return aggregate;
		}

		return {
			schemaVersion: 2 as const,
			generatedAt: aggregate.generatedAt,
			checkpointId: aggregate.checkpointId,
			summary: {
				...aggregate.summary,
				instances: aggregate.summary.machines,
			},
			machines: aggregate.machines.map((machine) => ({
				machineProfileKey: machine.machineProfileId,
				machineProfileId: machine.machineProfileId,
				...(machine.machineLabel ? { machineLabel: machine.machineLabel } : {}),
				verificationStatus: machine.verificationStatus,
				runCount: machine.runCount,
				itemCount: machine.itemCount,
				instanceCount: machine.runCount > 0 ? 1 : 0,
			})),
			items: aggregate.items.map((item) => ({
				...item,
				machineProfileKey: item.machineProfileId,
				machineProfileId: item.machineProfileId,
				...(item.machineLabel ? { machineLabel: item.machineLabel } : {}),
				...(item.machineLabel
					? { machineDisplayLabel: item.machineLabel }
					: {}),
			})),
		};
	});
