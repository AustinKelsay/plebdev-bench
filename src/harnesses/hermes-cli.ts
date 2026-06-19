/**
 * Purpose: Detect Hermes CLI headless chat capabilities and build compatible argv.
 * Exports: HermesRunFeatures, HermesRunArgsOpts, buildHermesRunArgs,
 *          detectHermesRunFeatures, getHermesRunFeatures,
 *          parseHermesRunFeatures, isHermesRunCompatible
 *
 * Invariants:
 * - Required flags are checked from `hermes chat --help`.
 * - Optional turn limits are emitted only when the installed CLI advertises them.
 * - Detection is cached per process to avoid adding per-item CLI overhead.
 */

import { execa } from "execa";

const HERMES_HELP_TIMEOUT_MS = 5_000;

/** Feature flags parsed from `hermes chat --help`. */
export interface HermesRunFeatures {
	/** CLI supports selecting the Runtime Model for benchmark transport. */
	supportsModel: boolean;
	/** CLI supports selecting the runtime provider for benchmark transport. */
	supportsProvider: boolean;
	/** CLI supports a single non-interactive prompt query. */
	supportsQuery: boolean;
	/** CLI supports selecting a limited toolset for benchmark runs. */
	supportsToolsets: boolean;
	/** CLI supports quiet output for programmatic callers. */
	supportsQuiet: boolean;
	/** CLI supports bypassing command approval prompts. */
	supportsYolo: boolean;
	/** CLI supports accepting configured hooks without an interactive prompt. */
	supportsAcceptHooks: boolean;
	/** CLI supports bounding agent turns. */
	supportsMaxTurns: boolean;
}

/** Inputs for constructing `hermes chat` argv. */
export interface HermesRunArgsOpts {
	/** Full prompt passed as the run message. */
	prompt: string;
	/** Runtime Model selected by the Matrix Item. */
	model: string;
	/** Optional turn limit for this generation attempt. */
	maxTurns?: number;
	/** Installed CLI features used to choose optional args. */
	features: HermesRunFeatures;
}

let cachedFeatures: HermesRunFeatures | undefined;
let cachedFeaturesPromise: Promise<HermesRunFeatures> | undefined;

/**
 * Parses `hermes chat --help` output into feature flags.
 *
 * @param helpText - Combined stdout/stderr help text from Hermes
 * @returns Parsed run feature support flags
 * @throws {never} This helper only parses a string with deterministic regexes
 */
export function parseHermesRunFeatures(helpText: string): HermesRunFeatures {
	const flags = new Set(helpText.match(/--[A-Za-z0-9][A-Za-z0-9-]*/g) ?? []);
	return {
		supportsModel: flags.has("--model"),
		supportsProvider: flags.has("--provider"),
		supportsQuery: flags.has("--query"),
		supportsToolsets: flags.has("--toolsets"),
		supportsQuiet: flags.has("--quiet"),
		supportsYolo: flags.has("--yolo"),
		supportsAcceptHooks: flags.has("--accept-hooks"),
		supportsMaxTurns: flags.has("--max-turns"),
	};
}

/**
 * Returns whether a Hermes CLI can run this benchmark harness.
 *
 * @param features - Parsed Hermes run feature flags
 * @returns True when all required benchmark run flags are available
 * @throws {never} This helper only checks boolean feature flags
 */
export function isHermesRunCompatible(features: HermesRunFeatures): boolean {
	return (
		features.supportsModel &&
		features.supportsProvider &&
		features.supportsQuery &&
		features.supportsToolsets &&
		features.supportsQuiet &&
		features.supportsYolo &&
		features.supportsAcceptHooks
	);
}

/**
 * Detects Hermes headless chat features from the installed CLI.
 *
 * @returns Parsed run feature support flags
 * @throws {Error} If the `hermes` binary is missing or help cannot be executed
 */
export async function detectHermesRunFeatures(): Promise<HermesRunFeatures> {
	try {
		const result = await execa("hermes", ["chat", "--help"], {
			timeout: HERMES_HELP_TIMEOUT_MS,
			reject: false,
		});
		const stdout = typeof result.stdout === "string" ? result.stdout : "";
		const stderr = typeof result.stderr === "string" ? result.stderr : "";
		return parseHermesRunFeatures(`${stdout}\n${stderr}`);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			throw new Error("hermes CLI not found");
		}
		throw error;
	}
}

/**
 * Gets cached Hermes run feature flags for the current process.
 *
 * @returns Parsed run feature support flags
 * @throws {Error} If Hermes feature detection fails
 */
export async function getHermesRunFeatures(): Promise<HermesRunFeatures> {
	if (cachedFeatures) {
		return cachedFeatures;
	}
	if (cachedFeaturesPromise) {
		return cachedFeaturesPromise;
	}

	cachedFeaturesPromise = detectHermesRunFeatures()
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
 * Builds argv for `hermes chat` using only supported optional flags.
 *
 * @param opts - Prompt, model, workspace, and detected CLI features
 * @returns Argument list passed after the `hermes` executable
 * @throws {Error} If the installed Hermes CLI does not advertise required flags
 */
export function buildHermesRunArgs(opts: HermesRunArgsOpts): string[] {
	const missingFlags = [
		...(opts.features.supportsProvider ? [] : ["--provider"]),
		...(opts.features.supportsModel ? [] : ["--model"]),
		...(opts.features.supportsQuery ? [] : ["--query"]),
		...(opts.features.supportsToolsets ? [] : ["--toolsets"]),
		...(opts.features.supportsQuiet ? [] : ["--quiet"]),
		...(opts.features.supportsYolo ? [] : ["--yolo"]),
		...(opts.features.supportsAcceptHooks ? [] : ["--accept-hooks"]),
	];
	if (missingFlags.length > 0) {
		throw new Error(
			`Installed Hermes CLI is incompatible with benchmark runs; missing ${missingFlags.join(", ")} for model ${opts.model}`,
		);
	}
	return [
		"chat",
		"--provider",
		"custom",
		"--model",
		opts.model,
		"--toolsets",
		"file",
		"--quiet",
		"--yolo",
		"--accept-hooks",
		...(opts.maxTurns !== undefined && opts.features.supportsMaxTurns
			? ["--max-turns", String(opts.maxTurns)]
			: []),
		"--query",
		opts.prompt,
	];
}
