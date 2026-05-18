/**
 * Purpose: RunResult schema for completed Benchmark Runs.
 * Exports: GenerationResultSchema, GenerationResult,
 *          MatrixItemResultSchema, MatrixItemResult,
 *          RunResultSchema, RunResult
 *
 * The Run Result preserves Benchmark Evidence in results/<runId>/run.json after execution.
 */

import { z } from "zod";
import {
	ArtifactRuntimeNameSchema,
	BenchmarkCheckpointSchema,
	FrontierEvalFailureTypeSchema,
	GenerationFailureTypeSchema,
	ItemStatusSchema,
	MachineProfileSchema,
	PassTypeSchema,
	RunProvenanceSchema,
	SCHEMA_VERSION,
	ScoringFailureTypeSchema,
	SignalAssessmentSchema,
	TestCategorySchema,
} from "./common.schema.js";
import { ModelProfileSchema } from "./model-profile.schema.js";

/** Zod schema for Generated Output from a Harness. */
export const GenerationResultSchema = z.object({
	/** Whether generation succeeded. */
	success: z.boolean(),

	/** Generated Output text. */
	output: z.string().optional(),

	/** Error message if generation failed. */
	error: z.string().optional(),

	/** Failure type when success=false. */
	failureType: GenerationFailureTypeSchema.optional(),

	/** Generation duration in milliseconds. */
	durationMs: z.number(),

	/** Prompt token count (if available from harness). */
	promptTokens: z.number().optional(),

	/** Completion token count (if available from harness). */
	completionTokens: z.number().optional(),

	/** Path to code file written by a tool-calling Harness. */
	codeFilePath: z.string().optional(),

	/** Published Redaction path token preserved for source traceability. */
	sourcePathToken: z.string().optional(),
});

/** Generated Output result from a Harness call. */
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

/** Zod schema for Automated Score Benchmark Evidence. */
export const AutomatedScoreSchema = z.object({
	/** Number of tests passed. */
	passed: z.number(),

	/** Number of tests failed. */
	failed: z.number(),

	/** Total number of tests. */
	total: z.number(),
});

/** Automated Score type. */
export type AutomatedScore = z.infer<typeof AutomatedScoreSchema>;

/** Zod schema for frontier evaluation. */
export const FrontierEvalSchema = z.object({
	/** Score from 1-10. */
	score: z.number().min(1).max(10),

	/** Reasoning from the frontier model. */
	reasoning: z.string(),

	/** Model used for evaluation. */
	model: z.string(),

	/** Evaluation latency in milliseconds. */
	latencyMs: z.number().optional(),
});

/** Frontier evaluation result type. */
export type FrontierEval = z.infer<typeof FrontierEvalSchema>;

/** Zod schema for scoring metrics (timing). */
export const ScoringMetricsSchema = z
	.object({
		/** Total scoring pipeline duration in milliseconds (includes compile-retry generation if used). */
		durationMs: z.number(),

		/** Pure scoring evaluation duration in milliseconds (excludes retry generation). */
		scoringDurationMs: z.number().optional(),

		/** Compile-feedback retry generation time in milliseconds (when retry path is used). */
		retryGenerationDurationMs: z.number().optional(),

		/** Retry family used by the scoring pipeline. */
		retryKind: z.enum(["compile-feedback", "opencode-workspace"]).optional(),

		/** Stable human-readable reason for a scoring retry. */
		retryReason: z.string().optional(),

		/** Whether a scoring-level retry was attempted. */
		retryAttempted: z.boolean().optional(),

		/** Whether the retry result replaced the first attempt. */
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
			if (!hasAnyRetryField) {
				return true;
			}
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

/** Scoring metrics type. */
export type ScoringMetrics = z.infer<typeof ScoringMetricsSchema>;

/** Zod schema for a generation failure record. */
export const GenerationFailureSchema = z.object({
	/** Failure type. */
	type: GenerationFailureTypeSchema,

	/** Human-readable failure message. */
	message: z.string(),
});

/** Generation failure record type. */
export type GenerationFailure = z.infer<typeof GenerationFailureSchema>;

/** Zod schema for a scoring failure record. */
export const ScoringFailureSchema = z.object({
	/** Failure type. */
	type: ScoringFailureTypeSchema,

	/** Human-readable failure message. */
	message: z.string(),
});

/** Scoring failure record type. */
export type ScoringFailure = z.infer<typeof ScoringFailureSchema>;

/** Zod schema for a frontier eval failure record. */
export const FrontierEvalFailureSchema = z.object({
	/** Failure type. */
	type: FrontierEvalFailureTypeSchema,

	/** Human-readable failure message. */
	message: z.string(),

	/** HTTP status code (if available). */
	status: z.number().optional(),

	/** Latency in milliseconds (if available). */
	latencyMs: z.number().optional(),

	/** Model used for evaluation (if known). */
	model: z.string().optional(),

	/** Attempts used before failing. */
	attempts: z.number().optional(),
});

/** Frontier eval failure record type. */
export type FrontierEvalFailure = z.infer<typeof FrontierEvalFailureSchema>;

/** Zod schema for one Matrix Item result and its Benchmark Evidence. */
export const MatrixItemResultSchema = z.object({
	/** Unique item ID (matches plan). */
	id: z.string(),

	/** Runtime name. */
	runtime: ArtifactRuntimeNameSchema,

	/** Runtime Model name. */
	model: z.string(),

	/** Deprecated compatibility alias for canonical model grouping. */
	modelAlias: z.string().optional(),

	/** Canonical model profile snapshot plus runtime-specific variant metadata. */
	modelProfile: ModelProfileSchema.optional(),

	/** Harness adapter name. */
	harness: z.string(),

	/** Benchmark Test slug. */
	test: z.string(),

	/** Benchmark Category (e.g., 'coding', 'computer-use'). */
	category: TestCategorySchema.optional(),

	/** Pass Type. */
	passType: PassTypeSchema,

	/** Execution status. */
	status: ItemStatusSchema,

	/** ISO 8601 timestamp when execution started. */
	startedAt: z.string().datetime().optional(),

	/** ISO 8601 timestamp when execution completed. */
	completedAt: z.string().datetime().optional(),

	/** Generated Output result from Harness. */
	generation: GenerationResultSchema.optional(),

	/** Number of generation attempts used for this item, including infra retries. */
	generationAttempts: z.number().int().positive().optional(),

	/** Structured generation failure record (when generation fails). */
	generationFailure: GenerationFailureSchema.optional(),

	/** Automated Score from the Benchmark Test Output Contract. */
	automatedScore: AutomatedScoreSchema.optional(),

	/** Scoring metrics (timing). */
	scoringMetrics: ScoringMetricsSchema.optional(),

	/** Structured scoring failure record (when scoring fails). */
	scoringFailure: ScoringFailureSchema.optional(),

	/** Frontier evaluation. */
	frontierEval: FrontierEvalSchema.optional(),

	/** Structured frontier eval failure record (when eval fails). */
	frontierEvalFailure: FrontierEvalFailureSchema.optional(),

	/** Signal Assessment for this row. */
	signalAssessment: SignalAssessmentSchema.optional(),
});

/** Result for a single Matrix Item execution. */
export type MatrixItemResult = z.infer<typeof MatrixItemResultSchema>;

/** Zod schema for the complete run result. */
export const RunResultSchema = z.object({
	/** Schema Version for migrations. */
	schemaVersion: z.string().default(SCHEMA_VERSION),

	/** Unique run identifier (matches plan). */
	runId: z.string(),

	/** Machine profile metadata snapshot. */
	machine: MachineProfileSchema.optional(),

	/** Benchmark Checkpoint metadata, distinct from Schema Version. */
	benchmarkCheckpoint: BenchmarkCheckpointSchema.optional(),

	/** Provenance metadata for this run. */
	provenance: RunProvenanceSchema.optional(),

	/** ISO 8601 timestamp when run started. */
	startedAt: z.string().datetime(),

	/** ISO 8601 timestamp when run completed. */
	completedAt: z.string().datetime(),

	/** Total run duration in milliseconds. */
	durationMs: z.number(),

	/** Summary counts. */
	summary: z.object({
		total: z.number(),
		completed: z.number(),
		failed: z.number(),
		pending: z.number(),
	}),

	/** All Matrix Item results. */
	items: z.array(MatrixItemResultSchema),
});

/** The Run Result written to run.json. */
export type RunResult = z.infer<typeof RunResultSchema>;
