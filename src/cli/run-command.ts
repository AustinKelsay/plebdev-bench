/**
 * Purpose: `bench run` command - execute benchmark matrix.
 * Exports: runCommand
 *
 * This command orchestrates:
 * 1. Config parsing from CLI options
 * 2. Model/test discovery
 * 3. Matrix expansion and plan creation
 * 4. Item execution
 * 5. Result writing
 */

import { Command } from "commander";
import { BenchConfigSchema, type BenchConfig } from "../schemas/index.js";
import { runBenchmark } from "../runner/index.js";
import { logger } from "../lib/logger.js";

/** CLI run command. */
export const runCommand = new Command("run")
	.description("Run benchmark matrix")
	.option(
		"-m, --models <models...>",
		"Limit to specific models (default: all from Ollama)",
	)
	.option("-t, --tests <tests...>", "Limit to specific tests (default: all in src/tests/)")
	.option(
		"-p, --pass-types <types...>",
		"Limit pass types: blind, informed (default: both)",
	)
	.option(
		"-H, --harnesses <harnesses...>",
		"Limit to specific harnesses: ollama, goose, opencode (default: all available)",
	)
	.option(
		"--ollama-url <url>",
		"Ollama API base URL",
		"http://localhost:11434",
	)
	.option("--timeout <ms>", "Generation timeout in milliseconds", "300000")
	.option("-o, --output <dir>", "Output directory", "results")
	.action(async (options) => {
		try {
			// Build config from CLI options
			const configInput: Partial<BenchConfig> = {
				ollamaBaseUrl: options.ollamaUrl,
				generateTimeoutMs: Number.parseInt(options.timeout, 10),
				outputDir: options.output,
			};

			// Add optional arrays if provided
			if (options.models) {
				configInput.models = options.models;
			}
			if (options.tests) {
				configInput.tests = options.tests;
			}
			if (options.passTypes) {
				configInput.passTypes = options.passTypes;
			}
			if (options.harnesses) {
				configInput.harnesses = options.harnesses;
			}

			// Validate config
			const parseResult = BenchConfigSchema.safeParse(configInput);
			if (!parseResult.success) {
				logger.error(
					{ errors: parseResult.error.flatten() },
					"Invalid configuration",
				);
				process.exit(1);
			}

			// Run the benchmark
			await runBenchmark(parseResult.data);
		} catch (error) {
			// Crash errors exit non-zero
			logger.error({ error }, "Benchmark run crashed");
			process.exit(1);
		}
	});
