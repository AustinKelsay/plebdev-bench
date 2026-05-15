/**
 * Purpose: Detect OpenCode CLI run capabilities and build compatible argv.
 * Exports: OpenCodeRunFeatures, OpenCodeRunArgsOpts, buildOpenCodeRunArgs,
 *          detectOpenCodeRunFeatures, getOpenCodeRunFeatures,
 *          parseOpenCodeRunFeatures, isOpenCodeRunCompatible
 *
 * Invariants:
 * - Required flags are checked from `opencode run --help`.
 * - Optional flags are only emitted when the installed CLI advertises them.
 * - Detection is cached per process to avoid adding per-item CLI overhead.
 */

import { execa } from "execa";

const OPENCODE_HELP_TIMEOUT_MS = 5_000;

/** Feature flags parsed from `opencode run --help`. */
export interface OpenCodeRunFeatures {
	/** CLI supports selecting provider/model for benchmark transport. */
	supportsModel: boolean;
	/** CLI supports JSON event output for deterministic parsing. */
	supportsFormat: boolean;
	/** CLI supports choosing the execution workspace. */
	supportsDir: boolean;
	/** CLI supports setting run log verbosity. */
	supportsLogLevel: boolean;
	/** CLI supports plugin-free run mode. */
	supportsPure: boolean;
}

/** Inputs for constructing `opencode run` argv. */
export interface OpenCodeRunArgsOpts {
	/** Full prompt passed as the run message. */
	prompt: string;
	/** Provider/model selector, for example `ollama/qwen3.5:4b`. */
	modelArg: string;
	/** Directory OpenCode should execute in. */
	executionWorkspaceDir: string;
	/** Installed CLI features used to choose optional args. */
	features: OpenCodeRunFeatures;
}

let cachedFeatures: OpenCodeRunFeatures | undefined;
let cachedFeaturesPromise: Promise<OpenCodeRunFeatures> | undefined;

/**
 * Parses `opencode run --help` output into feature flags.
 *
 * @param helpText - Combined stdout/stderr help text from OpenCode
 * @returns Parsed run feature support flags
 * @throws {never} This helper only parses a string with deterministic regexes
 */
export function parseOpenCodeRunFeatures(
	helpText: string,
): OpenCodeRunFeatures {
	const flags = new Set(helpText.match(/--[A-Za-z0-9][A-Za-z0-9-]*/g) ?? []);
	return {
		supportsModel: flags.has("--model"),
		supportsFormat: flags.has("--format"),
		supportsDir: flags.has("--dir"),
		supportsLogLevel: flags.has("--log-level"),
		supportsPure: flags.has("--pure"),
	};
}

/**
 * Returns whether an OpenCode CLI can run this benchmark harness.
 *
 * @param features - Parsed OpenCode run feature flags
 * @returns True when all required benchmark run flags are available
 * @throws {never} This helper only checks boolean feature flags
 */
export function isOpenCodeRunCompatible(
	features: OpenCodeRunFeatures,
): boolean {
	return (
		features.supportsModel &&
		features.supportsFormat &&
		features.supportsDir &&
		features.supportsLogLevel
	);
}

/**
 * Detects OpenCode run features from the installed CLI.
 *
 * Uses execa to run `opencode run --help` with OPENCODE_HELP_TIMEOUT_MS,
 * then delegates stdout/stderr parsing to parseOpenCodeRunFeatures.
 *
 * @returns Parsed run feature support flags
 * @throws {Error} If the `opencode` binary is missing or help cannot be executed
 */
export async function detectOpenCodeRunFeatures(): Promise<OpenCodeRunFeatures> {
	try {
		const result = await execa("opencode", ["run", "--help"], {
			timeout: OPENCODE_HELP_TIMEOUT_MS,
			reject: false,
		});
		const stdout = typeof result.stdout === "string" ? result.stdout : "";
		const stderr = typeof result.stderr === "string" ? result.stderr : "";
		return parseOpenCodeRunFeatures(`${stdout}\n${stderr}`);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			throw new Error("opencode CLI not found");
		}
		throw error;
	}
}

/**
 * Gets cached OpenCode run feature flags for the current process.
 *
 * @returns Parsed run feature support flags
 * @throws {Error} If OpenCode feature detection fails
 */
export async function getOpenCodeRunFeatures(): Promise<OpenCodeRunFeatures> {
	if (cachedFeatures) {
		return cachedFeatures;
	}
	if (cachedFeaturesPromise) {
		return cachedFeaturesPromise;
	}

	cachedFeaturesPromise = detectOpenCodeRunFeatures()
		.then((detectedFeatures) => {
			cachedFeatures = detectedFeatures;
			cachedFeaturesPromise = undefined;
			return detectedFeatures;
		})
		.catch((error) => {
			cachedFeatures = undefined;
			cachedFeaturesPromise = undefined;
			throw error;
		});
	return cachedFeaturesPromise;
}

/**
 * Builds argv for `opencode run` using only supported optional flags.
 *
 * @param opts - Prompt, model, workspace, and detected CLI features
 * @returns Argument list passed after the `opencode` executable
 * @throws {Error} If the installed OpenCode CLI does not advertise required
 * benchmark run flags for the provided model/workspace configuration
 */
export function buildOpenCodeRunArgs(opts: OpenCodeRunArgsOpts): string[] {
	const missingFlags = [
		...(opts.features.supportsModel ? [] : ["--model"]),
		...(opts.features.supportsFormat ? [] : ["--format"]),
		...(opts.features.supportsDir ? [] : ["--dir"]),
		...(opts.features.supportsLogLevel ? [] : ["--log-level"]),
	];
	if (missingFlags.length > 0) {
		throw new Error(
			`Installed OpenCode CLI is incompatible with benchmark runs; missing ${missingFlags.join(", ")} for model ${opts.modelArg} in workspace ${opts.executionWorkspaceDir}`,
		);
	}
	return [
		"run",
		"--model",
		opts.modelArg,
		"--format",
		"json",
		"--log-level",
		"ERROR",
		...(opts.features.supportsPure ? ["--pure"] : []),
		"--dir",
		opts.executionWorkspaceDir,
		opts.prompt,
	];
}
