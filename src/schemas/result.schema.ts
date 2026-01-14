/**
 * Purpose: RunResult schema for completed benchmark runs.
 * Exports: GenerationResultSchema, GenerationResult,
 *          MatrixItemResultSchema, MatrixItemResult,
 *          RunResultSchema, RunResult
 *
 * The result is written to results/<runId>/run.json after execution.
 */

import { z } from "zod";
import { ItemStatusSchema, PassTypeSchema, SCHEMA_VERSION } from "./common.schema.js";

/** Zod schema for generation output from a harness. */
export const GenerationResultSchema = z.object({
	/** Whether generation succeeded. */
	success: z.boolean(),

	/** Generated text output. */
	output: z.string().optional(),

	/** Error message if generation failed. */
	error: z.string().optional(),

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

/** Zod schema for frontier evaluation (out of scope for setup phase). */
export const FrontierEvalSchema = z.object({
	/** Score from 1-10. */
	score: z.number().min(1).max(10),

	/** Reasoning from the frontier model. */
	reasoning: z.string(),

	/** Model used for evaluation. */
	model: z.string(),
});

/** Frontier evaluation result type. */
export type FrontierEval = z.infer<typeof FrontierEvalSchema>;

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

	/** Automated test scoring (placeholder for MVP). */
	automatedScore: AutomatedScoreSchema.optional(),

	/** Frontier evaluation (out of scope for setup). */
	frontierEval: FrontierEvalSchema.optional(),
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
