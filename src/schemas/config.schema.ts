/**
 * Purpose: BenchConfig schema for CLI input and config file parsing.
 * Exports: BenchConfigSchema, BenchConfig, defaultConfig
 *
 * Invariants:
 * - Empty arrays mean "auto-discover all" for models/tests/harnesses
 * - Use flags to limit which models/tests/harnesses to run
 */

import { z } from "zod";
import { PassTypeSchema } from "./common.schema.js";

/** Zod schema for benchmark configuration. */
export const BenchConfigSchema = z.object({
	/** Models to benchmark. Empty array triggers auto-discovery from Ollama. */
	models: z.array(z.string()).default([]),

	/** Harness adapters to use. Empty array triggers auto-discovery of all available. */
	harnesses: z.array(z.string()).default([]),

	/** Test slugs to run. Empty array runs all tests in src/tests/. */
	tests: z.array(z.string()).default([]),

	/** Pass types to run for each model/test combination. */
	passTypes: z.array(PassTypeSchema).default(["blind", "informed"]),

	/** Ollama API base URL. */
	ollamaBaseUrl: z.string().url().default("http://localhost:11434"),

	/** Generation timeout in milliseconds (5 min default for large models). */
	generateTimeoutMs: z.number().positive().default(300_000),

	/** Output directory for results. */
	outputDir: z.string().default("results"),
});

/** Benchmark configuration type. */
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

/** Default configuration with all defaults applied. */
export const defaultConfig: BenchConfig = BenchConfigSchema.parse({});
