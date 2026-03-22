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

/**
 * Parses a CLI integer option using strict digit-only validation.
 *
 * @param optionName - Human-readable option label for error messages
 * @param rawValue - Raw CLI value
 * @returns Parsed integer
 * @throws {Error} If value is not a strict integer string
 */
function parseStrictIntegerOption(
	optionName: string,
	rawValue: unknown,
): number {
	const normalized = String(rawValue).trim();
	if (!/^\d+$/.test(normalized)) {
		throw new Error(
			`${optionName} must be a positive integer, received "${String(rawValue)}"`,
		);
	}
	const parsed = Number.parseInt(normalized, 10);
	if (parsed < 1) {
		throw new Error(
			`${optionName} must be greater than zero, received "${String(rawValue)}"`,
		);
	}
	return parsed;
}

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
	.option(
		"--goose-workspace-max-turns <n>",
		"Goose max turns for initial workspace attempt",
		"8",
	)
	.option(
		"--goose-workspace-retry-max-turns <n>",
		"Goose max turns for retry workspace attempt",
		"12",
	)
	.option("-o, --output <dir>", "Output directory", "results")
	.option(
		"--machine-instance-id <id>",
		"Stable machine instance ID (default: BENCH_MACHINE_INSTANCE_ID env or generated local ID)",
	)
	.option(
		"--machine-display-label <label>",
		"Optional display label for a specific machine instance",
	)
	.option(
		"--machine-id <id>",
		"Deprecated alias for --machine-instance-id",
	)
	.option(
		"--machine-label <label>",
		"Deprecated alias for --machine-display-label",
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

			const legacyMachineId =
				typeof options.machineId === "string" &&
				options.machineId.trim().length > 0
					? options.machineId.trim()
					: undefined;
			const legacyMachineLabel =
				typeof options.machineLabel === "string" &&
				options.machineLabel.trim().length > 0
					? options.machineLabel.trim()
					: undefined;
			const canonicalMachineId =
				typeof options.machineInstanceId === "string" &&
				options.machineInstanceId.trim().length > 0
					? options.machineInstanceId.trim()
					: undefined;
			const canonicalMachineLabel =
				typeof options.machineDisplayLabel === "string" &&
				options.machineDisplayLabel.trim().length > 0
					? options.machineDisplayLabel.trim()
					: undefined;
			if (
				legacyMachineId &&
				canonicalMachineId &&
				legacyMachineId !== canonicalMachineId
			) {
				throw new Error(
					`Conflicting machine identity flags: --machine-id="${legacyMachineId}" does not match --machine-instance-id="${canonicalMachineId}"`,
				);
			}
			if (
				legacyMachineLabel &&
				canonicalMachineLabel &&
				legacyMachineLabel !== canonicalMachineLabel
			) {
				throw new Error(
					`Conflicting machine label flags: --machine-label="${legacyMachineLabel}" does not match --machine-display-label="${canonicalMachineLabel}"`,
				);
			}
			if (legacyMachineId) {
				logger.warn(
					"Warning: --machine-id is deprecated; use --machine-instance-id",
				);
				options.machineInstanceId ??= legacyMachineId;
			}
			if (legacyMachineLabel) {
				logger.warn(
					"Warning: --machine-label is deprecated; use --machine-display-label",
				);
				options.machineDisplayLabel ??= legacyMachineLabel;
			}

			// Build config from CLI options
			const configInput: Partial<BenchConfig> = {
				ollamaBaseUrl: options.ollamaUrl,
				vllmBaseUrl: options.vllmUrl,
				generateTimeoutMs: Number.parseInt(options.timeout, 10),
				gooseMaxTurns: parseStrictIntegerOption(
					"--goose-max-turns",
					options.gooseMaxTurns,
				),
				gooseRetryMaxTurns: parseStrictIntegerOption(
					"--goose-retry-max-turns",
					options.gooseRetryMaxTurns,
				),
				gooseWorkspaceMaxTurns: parseStrictIntegerOption(
					"--goose-workspace-max-turns",
					options.gooseWorkspaceMaxTurns,
				),
				gooseWorkspaceRetryMaxTurns: parseStrictIntegerOption(
					"--goose-workspace-retry-max-turns",
					options.gooseWorkspaceRetryMaxTurns,
				),
				outputDir: options.output,
				machineInstanceId:
					typeof options.machineInstanceId === "string" &&
					options.machineInstanceId.trim().length > 0
						? options.machineInstanceId.trim()
						: undefined,
				machineDisplayLabel:
					typeof options.machineDisplayLabel === "string" &&
					options.machineDisplayLabel.trim().length > 0
						? options.machineDisplayLabel.trim()
						: undefined,
				modelAliases,
			};

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
