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

/**
 * Purpose: Managed vLLM lifecycle configuration.
 *
 * When enabled, the runner can start/stop vLLM (and optionally OrbStack) during
 * a single benchmark run so Ollama can run without the extra memory pressure.
 */
export const ManagedVllmSchema = z.object({
	/** Enable managed vLLM lifecycle for a single run. */
	enabled: z.boolean().default(false),

	/** The model to serve in vLLM (sets VLLM_MODEL for docker compose). */
	model: z.string().min(1),

	/** Docker compose file path for vLLM. */
	composeFile: z.string().min(1).default("docker/vllm/docker-compose.yml"),

	/** Startup timeout (ms) while waiting for vLLM to become ready. */
	startupTimeoutMs: z
		.number()
		.int()
		.positive()
		.default(30 * 60 * 1000),

	/** Stop vLLM after finishing the vLLM segment. */
	stopAfterRun: z.boolean().default(true),

	/** If true, attempt to start/stop OrbStack around the vLLM segment. */
	manageOrbStack: z.boolean().default(false),

	/** OrbStack CLI name or absolute path. */
	orbctlPath: z.string().min(1).default("orbctl"),
});

/** Managed vLLM config type. */
export type ManagedVllmConfig = z.infer<typeof ManagedVllmSchema>;

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

		/** Output directory for results. */
		outputDir: z.string().default("results"),

		/** Optional machine profile identifier used for cross-run aggregation. */
		machineProfileId: z.string().min(1).optional(),

		/** Optional human-readable machine label for dashboard display. */
		machineLabel: z.string().min(1).optional(),

		/** Model aliases for cross-runtime mapping. */
		modelAliases: ModelAliasMapSchema.default({}),

		/** Optional managed vLLM lifecycle configuration. */
		managedVllm: ManagedVllmSchema.optional(),
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
	});

/** Benchmark configuration type. */
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

/** Default configuration with all defaults applied. */
export const defaultConfig: BenchConfig = BenchConfigSchema.parse({});
