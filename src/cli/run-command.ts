/**
 * Purpose: `bench run` command - execute benchmark matrix.
 * Exports: runCommand
 *
 * This command orchestrates:
 * 1. Config parsing from CLI options
 * 2. Runtime/Model/Test discovery
 * 3. Matrix expansion and plan creation
 * 4. Item execution
 * 5. Result writing
 */

import { Command } from "commander";
import { logger } from "../lib/logger.js";
import {
	loadModelAliases,
	mergeAliases,
	parseInlineAliases,
} from "../lib/model-aliases.js";
import { runBenchmark } from "../runner/index.js";
import {
	type BenchConfig,
	BenchConfigSchema,
	type ModelAliasMap,
	testCategories,
} from "../schemas/index.js";

/** Human-readable category list for CLI help text. */
const CATEGORY_LIST = testCategories.join(", ");

/** CLI run command. */
export const runCommand = new Command("run")
	.description("Run benchmark matrix")
	.option(
		"-r, --runtimes <runtimes...>",
		"Limit to specific runtimes: ollama, vllm (default: all available)",
	)
	.option(
		"-m, --models <models...>",
		"Limit to specific models or aliases (default: all from runtime)",
	)
	.option(
		"-t, --tests <tests...>",
		"Limit to specific tests (default: all in src/tests/)",
	)
	.option(
		"-c, --categories <categories...>",
		`Limit to specific categories: ${CATEGORY_LIST} (default: all)`,
	)
	.option(
		"-p, --pass-types <types...>",
		"Limit pass types: blind, informed (default: both)",
	)
	.option(
		"-H, --harnesses <harnesses...>",
		"Limit to specific harnesses: direct, goose, opencode (default: all available). 'ollama' is accepted as alias for 'direct'.",
	)
	.option("--ollama-url <url>", "Ollama API base URL", "http://localhost:11434")
	.option("--vllm-url <url>", "vLLM API base URL", "http://localhost:8000")
	.option("--timeout <ms>", "Generation timeout in milliseconds", "300000")
	.option("--goose-max-turns <n>", "Goose max turns for initial attempt", "1")
	.option(
		"--goose-retry-max-turns <n>",
		"Goose max turns for retry attempt",
		"3",
	)
	.option("-o, --output <dir>", "Output directory", "results")
	.option(
		"--machine-id <id>",
		"Machine profile ID for cross-run aggregation (default: BENCH_MACHINE_ID env or deterministic anonymous ID)",
	)
	.option("--machine-label <label>", "Optional machine display label")
	.option(
		"--manage-vllm",
		"Manage vLLM lifecycle during a single run (docker compose up/down around the vLLM segment)",
		false,
	)
	.option(
		"--vllm-model <name>",
		"vLLM model to serve when --manage-vllm is enabled (sets VLLM_MODEL)",
	)
	.option(
		"--vllm-compose-file <path>",
		"Docker compose file for vLLM when --manage-vllm is enabled",
		"docker/vllm/docker-compose.yml",
	)
	.option(
		"--vllm-startup-timeout <ms>",
		"Timeout (ms) to wait for vLLM readiness when --manage-vllm is enabled",
		"1800000",
	)
	.option(
		"--manage-orbstack",
		"Attempt to start/stop OrbStack around the vLLM segment when --manage-vllm is enabled",
		false,
	)
	.option(
		"--orbctl-path <path>",
		"OrbStack CLI name or absolute path (used when --manage-orbstack is enabled)",
		"orbctl",
	)
	.option(
		"--model-config <file>",
		"JSON file with model aliases for cross-runtime mapping",
	)
	.option(
		"--model-alias <def...>",
		'Inline model alias: "name=runtime:model,runtime:model" (repeatable)',
	)
	.action(async (options) => {
		try {
			// Build model aliases from file and/or inline definitions
			let modelAliases: ModelAliasMap = {};

			if (options.modelConfig) {
				const fileAliases = loadModelAliases(options.modelConfig);
				modelAliases = mergeAliases(modelAliases, fileAliases);
				logger.info(
					{ file: options.modelConfig, count: Object.keys(fileAliases).length },
					"Loaded model aliases from file",
				);
			}

			if (options.modelAlias) {
				const inlineAliases = parseInlineAliases(options.modelAlias);
				modelAliases = mergeAliases(modelAliases, inlineAliases);
				logger.info(
					{ count: Object.keys(inlineAliases).length },
					"Parsed inline model aliases",
				);
			}

			// Build config from CLI options
			const configInput: Partial<BenchConfig> = {
				ollamaBaseUrl: options.ollamaUrl,
				vllmBaseUrl: options.vllmUrl,
				generateTimeoutMs: Number.parseInt(options.timeout, 10),
				gooseMaxTurns: Number.parseInt(options.gooseMaxTurns, 10),
				gooseRetryMaxTurns: Number.parseInt(options.gooseRetryMaxTurns, 10),
				outputDir: options.output,
				machineProfileId:
					typeof options.machineId === "string" &&
					options.machineId.trim().length > 0
						? options.machineId.trim()
						: undefined,
				machineLabel:
					typeof options.machineLabel === "string" &&
					options.machineLabel.trim().length > 0
						? options.machineLabel.trim()
						: undefined,
				modelAliases,
			};

			if (options.manageVllm) {
				if (
					typeof options.vllmModel !== "string" ||
					options.vllmModel.trim().length === 0
				) {
					throw new Error("--manage-vllm requires --vllm-model <name>");
				}
				configInput.managedVllm = {
					enabled: true,
					model: options.vllmModel.trim(),
					composeFile: String(options.vllmComposeFile),
					startupTimeoutMs: Number.parseInt(
						String(options.vllmStartupTimeout),
						10,
					),
					stopAfterRun: true,
					manageOrbStack: Boolean(options.manageOrbstack),
					orbctlPath: String(options.orbctlPath),
				};
			}

			// Add optional arrays if provided
			if (options.runtimes) {
				configInput.runtimes = options.runtimes;
			}
			if (options.models) {
				configInput.models = options.models;
			}
			if (options.tests) {
				configInput.tests = options.tests;
			}
			if (options.categories) {
				configInput.categories = options.categories;
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
