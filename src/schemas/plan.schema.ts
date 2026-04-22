/**
 * Purpose: RunPlan schema capturing the expanded matrix before execution.
 * Exports: MatrixItemSchema, MatrixItem, RunPlanSchema, RunPlan
 *
 * The plan is written to results/<runId>/plan.json for reproducibility.
 */

import { z } from "zod";
import {
	ArtifactRuntimeNameSchema,
	BenchmarkCheckpointSchema,
	HarnessCapabilitySchema,
	MachineProfileSchema,
	PassTypeSchema,
	RunProvenanceSchema,
	RuntimeEnvironmentSchema,
	SCHEMA_VERSION,
	TestCategorySchema,
	TestScoringModeSchema,
} from "./common.schema.js";
import { ModelProfileSchema } from "./model-profile.schema.js";

/** Model exclusion reason codes emitted during plan construction. */
const ModelExclusionReasonSchema = z.literal("non_generative_model");

/** Evidence captured when a discovered runtime model is excluded. */
const ModelExclusionEvidenceSchema = z
	.object({
		family: z.string().optional(),
		families: z.array(z.string()).optional(),
		architecture: z.string().optional(),
	})
	.optional();

/** Zod schema for models omitted from generative benchmark plans. */
export const ModelExclusionSchema = z.object({
	/** Runtime where the model was discovered. */
	runtime: ArtifactRuntimeNameSchema,

	/** Runtime model name that was excluded. */
	model: z.string(),

	/** Stable exclusion reason. */
	reason: ModelExclusionReasonSchema,

	/** Best-effort metadata explaining the exclusion. */
	evidence: ModelExclusionEvidenceSchema,
});

/** Model omitted from a run plan before matrix expansion. */
export type ModelExclusion = z.infer<typeof ModelExclusionSchema>;

/** Zod schema for a single matrix item (one runtime/harness/model/test/passType combo). */
export const MatrixItemSchema = z.object({
	/** Unique item ID within the run (e.g., '01', '02'). */
	id: z.string(),

	/** Runtime name (e.g., 'ollama'). */
	runtime: ArtifactRuntimeNameSchema,

	/** Model name (e.g., 'llama3.2:3b'). */
	model: z.string(),

	/** Deprecated compatibility alias for canonical model grouping. */
	modelAlias: z.string().optional(),

	/** Canonical model profile snapshot plus runtime-specific variant metadata. */
	modelProfile: ModelProfileSchema.optional(),

	/** Harness adapter name (e.g., 'direct'). */
	harness: z.string(),

	/** Test slug (e.g., 'smoke'). */
	test: z.string(),

	/** Test category (e.g., 'coding', 'computer-use'). */
	category: TestCategorySchema.optional(),

	/** Test scoring mode (e.g., 'code-module', 'workspace'). */
	scoringMode: TestScoringModeSchema.default("code-module"),

	/** Whether this test requires a tool-calling harness. */
	requiresTools: z.boolean().default(false),

	/** Explicit harness capabilities required for representative execution. */
	requiredHarnessCapabilities: z.array(HarnessCapabilitySchema).default([]),

	/** Test tags copied from metadata for ordering and preflight logic. */
	tags: z.array(z.string()).default([]),

	/** Per-test timeout multiplier copied from metadata for reproducible timeout policy. */
	timeoutMultiplier: z.number().positive().default(1),

	/** Pass type: 'blind' or 'informed'. */
	passType: PassTypeSchema,
});

/** A single matrix item representing one benchmark execution. */
export type MatrixItem = z.infer<typeof MatrixItemSchema>;

/** Zod schema for the run plan. */
export const RunPlanSchema = z.object({
	/** Schema version for migrations. */
	schemaVersion: z.string().default(SCHEMA_VERSION),

	/** Unique run identifier (e.g., '20260114-143052-abc123'). */
	runId: z.string(),

	/** ISO 8601 timestamp when plan was created. */
	createdAt: z.string().datetime(),

	/** Runtime environment metadata snapshot. */
	runtimeEnvironment: RuntimeEnvironmentSchema.optional(),

	/** Machine profile metadata snapshot. */
	machine: MachineProfileSchema.optional(),

	/** Benchmark checkpoint metadata for this run plan. */
	benchmarkCheckpoint: BenchmarkCheckpointSchema.optional(),

	/** Provenance metadata for this run plan. */
	provenance: RunProvenanceSchema.optional(),

	/** Resolved configuration snapshot (subset relevant to reproducibility). */
	config: z.object({
		ollamaBaseUrl: z.string().url(),
		generateTimeoutMs: z.number(),
		gooseMaxTurns: z.number().int().positive().optional(),
		gooseRetryMaxTurns: z.number().int().positive().optional(),
		gooseWorkspaceMaxTurns: z.number().int().positive().optional(),
		gooseWorkspaceRetryMaxTurns: z.number().int().positive().optional(),
		passTypes: z.array(PassTypeSchema),
		categories: z.array(TestCategorySchema).optional(),
	}),

	/** Expanded matrix items to execute. */
	items: z.array(MatrixItemSchema),

	/** Discovered models omitted before matrix expansion. */
	modelExclusions: z.array(ModelExclusionSchema).optional(),

	/** Summary counts for display. */
	summary: z.object({
		totalItems: z.number(),
		runtimes: z.number(),
		models: z.number(),
		harnesses: z.number(),
		tests: z.number(),
		categories: z.number().optional(),
	}),
});

/** The run plan written to plan.json. */
export type RunPlan = z.infer<typeof RunPlanSchema>;
