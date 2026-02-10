/**
 * Purpose: Common harness interface and types for all adapters.
 * Exports: Harness, GenerateOpts, GenerateResult, HarnessName, HARNESS_NAMES
 *
 * All harnesses implement this interface to provide a unified API for:
 * - Checking availability (ping)
 * - Generating completions
 *
 * Model discovery is delegated to Runtime (not Harness).
 */

import type { Runtime } from "../runtimes/index.js";

/** Supported harness names. "direct" replaces "ollama" for clarity. */
export const HARNESS_NAMES = ["direct", "goose", "opencode"] as const;
export type HarnessName = (typeof HARNESS_NAMES)[number];

/** Legacy harness name alias for backward compatibility. */
export const LEGACY_HARNESS_ALIAS = "ollama" as const;

/** Harnesses that require tool-calling to produce output files. */
export const TOOL_CALLING_HARNESS_NAMES = ["goose", "opencode"] as const;
export type ToolCallingHarnessName =
	(typeof TOOL_CALLING_HARNESS_NAMES)[number];

/**
 * Runtime compatibility for each harness.
 * Maps harness name to array of compatible runtime names.
 *
 * All harnesses now support multiple runtimes via API format abstraction:
 * - direct: dispatches to ollama-client or openai-compat-client based on runtime.apiFormat
 * - goose: maps runtime.apiFormat to --provider (ollama or openai)
 * - opencode: dynamically configures provider in opencode.json based on runtime
 */
export const HARNESS_RUNTIME_COMPATIBILITY: Record<
	HarnessName,
	readonly string[]
> = {
	direct: ["ollama", "vllm"],
	goose: ["ollama", "vllm"],
	opencode: ["ollama", "vllm"],
} as const;

/**
 * Checks if a harness is compatible with a given runtime.
 * @param harness - Harness name
 * @param runtime - Runtime name
 * @returns true if the harness can be used with the runtime
 */
export function isHarnessCompatibleWithRuntime(
	harness: HarnessName,
	runtime: string,
): boolean {
	const compatibleRuntimes = HARNESS_RUNTIME_COMPATIBILITY[harness];
	return compatibleRuntimes.includes(runtime);
}

/**
 * Gets harnesses compatible with a given runtime.
 * @param runtime - Runtime name
 * @returns Array of compatible harness names
 */
export function getCompatibleHarnesses(runtime: string): HarnessName[] {
	return HARNESS_NAMES.filter((harness) =>
		isHarnessCompatibleWithRuntime(harness, runtime),
	);
}

/** Options for generating a completion. */
export interface GenerateOpts {
	/** Model name in Ollama format (e.g., "llama3.2:3b"). */
	model: string;
	/** The prompt to send to the model. */
	prompt: string;
	/** Timeout in milliseconds. */
	timeoutMs: number;
	/** If true, unload model after generation (Ollama-specific, ignored by CLI harnesses). */
	unloadAfter?: boolean;
	/** Runtime to use for generation. */
	runtime: Runtime;
}

/** Result from a generation request. */
export interface GenerateResult {
	/** The generated output text. */
	output: string;
	/** Time taken in milliseconds. */
	durationMs: number;
	/** Number of prompt tokens (if available). */
	promptTokens?: number;
	/** Number of completion tokens (if available). */
	completionTokens?: number;
	/** Path to code file written by tool-calling harness (e.g., Goose developer extension). */
	codeFilePath?: string;
}

/**
 * Common interface for all harness adapters.
 *
 * Each harness provides a way to generate completions from LLMs.
 * Harnesses use a Runtime for the actual inference backend.
 */
export interface Harness {
	/** Harness identifier (e.g., "direct", "goose", "opencode"). */
	readonly name: HarnessName;

	/**
	 * Check if the harness is available.
	 * For "direct", always returns true (availability depends on runtime).
	 * For CLI harnesses, checks if the CLI is installed.
	 * @returns true if the harness can be used
	 */
	ping(): Promise<boolean>;

	/**
	 * Generate a completion.
	 * @param opts - Generation options (includes runtime)
	 * @returns The generation result
	 * @throws {Error} On timeout or execution failure
	 */
	generate(opts: GenerateOpts): Promise<GenerateResult>;
}

/**
 * Normalizes a harness name, mapping legacy names to current ones.
 * @param name - Harness name (may be legacy)
 * @returns Normalized harness name
 */
export function normalizeHarnessName(name: string): HarnessName {
	if (name === LEGACY_HARNESS_ALIAS) {
		return "direct";
	}
	if (HARNESS_NAMES.includes(name as HarnessName)) {
		return name as HarnessName;
	}
	throw new Error(`Invalid harness name: ${name}`);
}

/**
 * Checks if a harness name is valid (including legacy names).
 * @param name - Harness name to check
 * @returns true if valid
 */
export function isValidHarnessName(name: string): boolean {
	return (
		HARNESS_NAMES.includes(name as HarnessName) || name === LEGACY_HARNESS_ALIAS
	);
}
