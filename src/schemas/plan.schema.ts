/**
 * Purpose: RunPlan schema capturing the expanded matrix before execution.
 * Exports: MatrixItemSchema, MatrixItem, RunPlanSchema, RunPlan
 *
 * The plan is written to results/<runId>/plan.json for reproducibility.
 */

import { z } from "zod";
import { PassTypeSchema, SCHEMA_VERSION } from "./common.schema.js";

/** Zod schema for a single matrix item (one model/harness/test/passType combo). */
export const MatrixItemSchema = z.object({
	/** Unique item ID within the run (e.g., '01', '02'). */
	id: z.string(),

	/** Model name (e.g., 'llama3.2:3b'). */
	model: z.string(),

	/** Harness adapter name (e.g., 'ollama'). */
	harness: z.string(),

	/** Test slug (e.g., 'smoke'). */
	test: z.string(),

	/** Pass type: 'blind' or 'informed'. */
	passType: PassTypeSchema,
});

/** A single matrix item representing one benchmark execution. */
export type MatrixItem = z.infer<typeof MatrixItemSchema>;

/** Zod schema for environment metadata. */
export const EnvironmentSchema = z.object({
	/** Platform (e.g., 'darwin', 'linux'). */
	platform: z.string(),

	/** Bun version. */
	bunVersion: z.string(),
});

/** Environment metadata type. */
export type Environment = z.infer<typeof EnvironmentSchema>;

/** Zod schema for the run plan. */
export const RunPlanSchema = z.object({
	/** Schema version for migrations. */
	schemaVersion: z.string().default(SCHEMA_VERSION),

	/** Unique run identifier (e.g., '20260114-143052-abc123'). */
	runId: z.string(),

	/** ISO 8601 timestamp when plan was created. */
	createdAt: z.string().datetime(),

	/** Environment metadata snapshot. */
	environment: EnvironmentSchema,

	/** Resolved configuration snapshot (subset relevant to reproducibility). */
	config: z.object({
		ollamaBaseUrl: z.string(),
		generateTimeoutMs: z.number(),
		passTypes: z.array(PassTypeSchema),
	}),

	/** Expanded matrix items to execute. */
	items: z.array(MatrixItemSchema),

	/** Summary counts for display. */
	summary: z.object({
		totalItems: z.number(),
		models: z.number(),
		harnesses: z.number(),
		tests: z.number(),
	}),
});

/** The run plan written to plan.json. */
export type RunPlan = z.infer<typeof RunPlanSchema>;
