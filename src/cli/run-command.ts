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
	loadModelProfiles,
	mergeModelProfiles,
	parseInlineModelProfiles,
} from "../lib/model-profiles.js";
import { runBenchmark } from "../runner/index.js";
import {
	type BenchConfig,
	BenchConfigSchema,
	type ModelProfileRegistry,
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

/**
 * Normalizes an optional CLI string flag and rejects explicit blank values.
 *
 * @param optionName - CLI flag name for error messages
 * @param rawValue - Raw commander option value
 * @returns Trimmed non-empty value or undefined
 * @throws {Error} When the flag was provided as only whitespace
 */
function normalizeOptionalStringOption(
	optionName: string,
	rawValue: unknown,
): string | undefined {
	if (typeof rawValue !== "string") {
		return undefined;
	}
	const trimmed = rawValue.trim();
	if (trimmed.length === 0) {
		throw new Error(`${optionName} must not be empty`);
	}
	return trimmed;
}

/** CLI run command. */
export const runCommand = new Command("run")
	.description("Run benchmark matrix")
	.option(
		"-r, --runtimes <runtimes...>",
		"Limit to specific runtimes: ollama (default: ollama)",
	)
	.option(
		"-m, --models <models...>",
		"Limit to specific runtime models or canonical profile keys (default: all from runtime)",
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
		"Limit to specific harnesses: direct, goose, hermes, opencode (default: all available). 'ollama' is accepted as alias for 'direct'.",
	)
	.option("--ollama-url <url>", "Ollama API base URL", "http://localhost:11434")
	.option(
		"--vllm-url <url>",
		"Deprecated alias for --ollama-url; runtime remains Ollama-only",
	)
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
	.option("--hermes-max-turns <n>", "Hermes max turns for initial attempt", "1")
	.option(
		"--hermes-retry-max-turns <n>",
		"Hermes max turns for retry attempt",
		"3",
	)
	.option(
		"--hermes-workspace-max-turns <n>",
		"Hermes max turns for initial workspace attempt",
		"8",
	)
	.option(
		"--hermes-workspace-retry-max-turns <n>",
		"Hermes max turns for retry workspace attempt",
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
	.option("--machine-id <id>", "Deprecated alias for --machine-instance-id")
	.option(
		"--machine-label <label>",
		"Deprecated alias for --machine-display-label",
	)
	.option(
		"--model-config <file>",
		"JSON file with model profiles for cross-runtime mapping",
	)
	.option(
		"--model-alias <def...>",
		'Inline model profile shorthand: "name=runtime:model,runtime:model" (repeatable)',
	)
	.action(async (options) => {
		try {
			// Build model profiles from file and/or inline definitions.
			let modelProfiles: ModelProfileRegistry = {};

			if (options.modelConfig) {
				const fileProfiles = loadModelProfiles(options.modelConfig);
				modelProfiles = mergeModelProfiles(modelProfiles, fileProfiles);
				logger.info(
					{
						file: options.modelConfig,
						count: Object.keys(fileProfiles).length,
					},
					"Loaded model profiles from file",
				);
			}

			if (options.modelAlias) {
				const inlineProfiles = parseInlineModelProfiles(options.modelAlias);
				modelProfiles = mergeModelProfiles(modelProfiles, inlineProfiles);
				logger.info(
					{ count: Object.keys(inlineProfiles).length },
					"Parsed inline model profile shorthands",
				);
			}

			const legacyMachineId = normalizeOptionalStringOption(
				"--machine-id",
				options.machineId,
			);
			const legacyMachineLabel = normalizeOptionalStringOption(
				"--machine-label",
				options.machineLabel,
			);
			const canonicalMachineId = normalizeOptionalStringOption(
				"--machine-instance-id",
				options.machineInstanceId,
			);
			const canonicalMachineLabel = normalizeOptionalStringOption(
				"--machine-display-label",
				options.machineDisplayLabel,
			);
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
			const resolvedMachineId = canonicalMachineId ?? legacyMachineId;
			const resolvedMachineLabel = canonicalMachineLabel ?? legacyMachineLabel;
			if (legacyMachineId) {
				logger.warn(
					"Warning: --machine-id is deprecated; use --machine-instance-id",
				);
			}
			if (legacyMachineLabel) {
				logger.warn(
					"Warning: --machine-label is deprecated; use --machine-display-label",
				);
			}
			const parsedOllamaUrl = normalizeOptionalStringOption(
				"--ollama-url",
				options.ollamaUrl,
			);
			const deprecatedVllmUrl = normalizeOptionalStringOption(
				"--vllm-url",
				options.vllmUrl,
			);
			if (deprecatedVllmUrl) {
				logger.warn(
					"Warning: --vllm-url is deprecated; use --ollama-url. This alias will be removed next release.",
				);
			}
			const hasExplicitOllamaUrl =
				runCommand.getOptionValueSource("ollamaUrl") === "cli";
			if (
				hasExplicitOllamaUrl &&
				deprecatedVllmUrl &&
				parsedOllamaUrl !== deprecatedVllmUrl
			) {
				throw new Error(
					`Conflicting runtime URL flags: --ollama-url="${parsedOllamaUrl}" does not match deprecated --vllm-url="${deprecatedVllmUrl}"`,
				);
			}
			const resolvedOllamaUrl =
				(hasExplicitOllamaUrl || !deprecatedVllmUrl
					? parsedOllamaUrl
					: deprecatedVllmUrl) ?? "http://localhost:11434";

			// Build config from CLI options
			const configInput: Partial<BenchConfig> = {
				ollamaBaseUrl: resolvedOllamaUrl,
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
				hermesMaxTurns: parseStrictIntegerOption(
					"--hermes-max-turns",
					options.hermesMaxTurns,
				),
				hermesRetryMaxTurns: parseStrictIntegerOption(
					"--hermes-retry-max-turns",
					options.hermesRetryMaxTurns,
				),
				hermesWorkspaceMaxTurns: parseStrictIntegerOption(
					"--hermes-workspace-max-turns",
					options.hermesWorkspaceMaxTurns,
				),
				hermesWorkspaceRetryMaxTurns: parseStrictIntegerOption(
					"--hermes-workspace-retry-max-turns",
					options.hermesWorkspaceRetryMaxTurns,
				),
				outputDir: options.output,
				machineInstanceId: resolvedMachineId,
				machineDisplayLabel: resolvedMachineLabel,
				modelProfiles,
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
