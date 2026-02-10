/**
 * Purpose: Zod schemas for dashboard API boundary validation.
 * Exports: RunResultSchema, RunPlanSchema, RunListItemSchema
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
	environment: z.object({
		platform: z.string(),
		bunVersion: z.string(),
	}),
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
});

/** Array of run list items (index.json). */
export const RunListSchema = z.array(RunListItemSchema);
