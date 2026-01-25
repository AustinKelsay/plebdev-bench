/**
 * Purpose: RunResult schema for completed benchmark runs.
 * Exports: GenerationResultSchema, GenerationResult,
 *          MatrixItemResultSchema, MatrixItemResult,
 *          RunResultSchema, RunResult
 *
 * The result is written to results/<runId>/run.json after execution.
 */

import { z } from "zod";
import {
	ItemStatusSchema,
	PassTypeSchema,
	SCHEMA_VERSION,
	GenerationFailureTypeSchema,
	ScoringFailureTypeSchema,
	FrontierEvalFailureTypeSchema,
} from "./common.schema.js";

/** Zod schema for generation output from a harness. */
export const GenerationResultSchema = z.object({
	/** Whether generation succeeded. */
	success: z.boolean(),

	/** Generated text output. */
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
});

/** Generation result from a harness call. */
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

/** Zod schema for automated test scoring (placeholder for MVP). */
export const AutomatedScoreSchema = z.object({
	/** Number of tests passed. */
	passed: z.number(),

	/** Number of tests failed. */
	failed: z.number(),

	/** Total number of tests. */
	total: z.number(),
});

/** Automated test score type. */
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
export const ScoringMetricsSchema = z.object({
	/** Scoring duration in milliseconds. */
	durationMs: z.number(),
});

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

/** Zod schema for a single matrix item result. */
export const MatrixItemResultSchema = z.object({
	/** Unique item ID (matches plan). */
	id: z.string(),

	/** Model name. */
	model: z.string(),

	/** Harness adapter name. */
	harness: z.string(),

	/** Test slug. */
	test: z.string(),

	/** Pass type. */
	passType: PassTypeSchema,

	/** Execution status. */
	status: ItemStatusSchema,

	/** ISO 8601 timestamp when execution started. */
	startedAt: z.string().datetime().optional(),

	/** ISO 8601 timestamp when execution completed. */
	completedAt: z.string().datetime().optional(),

	/** Generation result from harness. */
	generation: GenerationResultSchema.optional(),

	/** Structured generation failure record (when generation fails). */
	generationFailure: GenerationFailureSchema.optional(),

	/** Automated test scoring. */
	automatedScore: AutomatedScoreSchema.optional(),

	/** Scoring metrics (timing). */
	scoringMetrics: ScoringMetricsSchema.optional(),

	/** Structured scoring failure record (when scoring fails). */
	scoringFailure: ScoringFailureSchema.optional(),

	/** Frontier evaluation. */
	frontierEval: FrontierEvalSchema.optional(),

	/** Structured frontier eval failure record (when eval fails). */
	frontierEvalFailure: FrontierEvalFailureSchema.optional(),
});

/** Result for a single matrix item execution. */
export type MatrixItemResult = z.infer<typeof MatrixItemResultSchema>;

/** Zod schema for the complete run result. */
export const RunResultSchema = z.object({
	/** Schema version for migrations. */
	schemaVersion: z.string().default(SCHEMA_VERSION),

	/** Unique run identifier (matches plan). */
	runId: z.string(),

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

	/** All item results. */
	items: z.array(MatrixItemResultSchema),
});

/** The run result written to run.json. */
export type RunResult = z.infer<typeof RunResultSchema>;
