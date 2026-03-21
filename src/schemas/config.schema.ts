/**
 * Purpose: BenchConfig schema for CLI input and config file parsing.
 * Exports: BenchConfigSchema, BenchConfig, defaultConfig
 *
 * Invariants:
 * - Empty arrays mean "auto-discover all" for models/tests/harnesses/runtimes/categories
 * - Use flags to limit which models/tests/harnesses/runtimes/categories to run
 */

import { z } from "zod";
import {
	PassTypeSchema,
	RuntimeNameSchema,
	SCHEMA_VERSION,
	TestCategorySchema,
} from "./common.schema.js";
import { ModelAliasMapSchema } from "./model-alias.schema.js";

/** Zod schema for benchmark configuration. */
export const BenchConfigSchema = z
	.object({
		/** Schema version for config evolution. */
		schemaVersion: z.string().default(SCHEMA_VERSION),

		/** Runtimes to use. Empty array triggers auto-discovery. */
		runtimes: z.array(RuntimeNameSchema).default([]),

		/** Models to benchmark. Empty array triggers auto-discovery from runtime. */
		models: z.array(z.string()).default([]),

		/** Harness adapters to use. Empty array triggers auto-discovery of all available. */
		harnesses: z.array(z.string()).default([]),

		/** Test slugs to run. Empty array runs all tests in src/tests/. */
		tests: z.array(z.string()).default([]),

		/** Test categories to run. Empty array runs all categories. */
		categories: z.array(TestCategorySchema).default([]),

		/** Pass types to run for each model/test combination. */
		passTypes: z.array(PassTypeSchema).default(["blind", "informed"]),

		/** Ollama API base URL. */
		ollamaBaseUrl: z.string().url().default("http://localhost:11434"),

		/** vLLM API base URL. */
		vllmBaseUrl: z.string().url().default("http://localhost:8000"),

		/** Generation timeout in milliseconds (5 min default for large models). */
		generateTimeoutMs: z.number().positive().default(300_000),

		/** Goose first-attempt max turns in headless mode. */
		gooseMaxTurns: z.number().int().positive().default(1),

		/** Goose retry-attempt max turns in headless mode. */
		gooseRetryMaxTurns: z.number().int().positive().default(3),

		/** Goose first-attempt max turns for workspace-scored benchmarks. */
		gooseWorkspaceMaxTurns: z.number().int().positive().default(8),

		/** Goose retry-attempt max turns for workspace-scored benchmarks. */
		gooseWorkspaceRetryMaxTurns: z.number().int().positive().default(12),

		/** Output directory for results. */
		outputDir: z.string().default("results"),

		/** Optional machine profile identifier used for cross-run aggregation. */
		machineProfileId: z.string().min(1).optional(),

		/** Optional human-readable machine label for dashboard display. */
		machineLabel: z.string().min(1).optional(),

		/** Model aliases for cross-runtime mapping. */
		modelAliases: ModelAliasMapSchema.default({}),
	})
	.superRefine((config, context) => {
		if (config.gooseRetryMaxTurns < config.gooseMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["gooseRetryMaxTurns"],
				message:
					"gooseRetryMaxTurns must be greater than or equal to gooseMaxTurns",
			});
		}

		if (config.gooseWorkspaceRetryMaxTurns < config.gooseWorkspaceMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["gooseWorkspaceRetryMaxTurns"],
				message:
					"gooseWorkspaceRetryMaxTurns must be greater than or equal to gooseWorkspaceMaxTurns",
			});
		}
	});

/** Benchmark configuration type. */
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

/** Default configuration with all defaults applied. */
export const defaultConfig: BenchConfig = BenchConfigSchema.parse({});
