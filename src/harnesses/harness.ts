/**
 * Purpose: Common harness interface and types for all adapters.
 * Exports: Harness, GenerateOpts, GenerateResult, HarnessName, HARNESS_NAMES,
 *          HarnessPromptMode, TOOL_CALLING_HARNESS_NAMES,
 *          HARNESS_CAPABILITY_MAP, getHarnessCapabilities,
 *          doesHarnessSupportCapabilities
 *
 * All harnesses implement this interface to provide a unified API for:
 * - Checking availability (ping)
 * - Generating completions
 *
 * Model discovery is delegated to Runtime (not Harness).
 */

import type { Runtime } from "../runtimes/index.js";
import type { HarnessCapability, SignalAssessment } from "../schemas/index.js";

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
 * Explicit workspace capabilities supported by each harness.
 *
 * These capabilities are intentionally conservative. A harness should only
 * advertise a capability when the runner config exposes a stable tool path for it.
 */
export const HARNESS_CAPABILITY_MAP: Record<
	HarnessName,
	readonly HarnessCapability[]
> = {
	direct: [],
	goose: ["workspace-read", "workspace-write"],
	opencode: [
		"workspace-read",
		"workspace-write",
		"workspace-mkdir",
		"workspace-search",
		"workspace-delete",
	],
} as const;

/** Prompt handling modes supported by harness adapters. */
export const HARNESS_PROMPT_MODES = ["code-output", "workspace"] as const;
export type HarnessPromptMode = (typeof HARNESS_PROMPT_MODES)[number];

/**
 * Runtime compatibility for each harness.
 * Maps harness name to array of compatible runtime names.
 */
export const HARNESS_RUNTIME_COMPATIBILITY: Record<
	HarnessName,
	readonly string[]
> = {
	direct: ["ollama"],
	goose: ["ollama"],
	opencode: ["ollama"],
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

/**
 * Gets the explicit workspace capabilities for a harness.
 *
 * @param harness - Harness name
 * @returns Read-only list of supported capabilities
 */
export function getHarnessCapabilities(
	harness: HarnessName,
): readonly HarnessCapability[] {
	return HARNESS_CAPABILITY_MAP[harness];
}

/**
 * Checks whether a harness supports every capability required by a test.
 *
 * @param harness - Harness name
 * @param requiredCapabilities - Required capability list from test metadata
 * @returns True when the harness advertises all required capabilities
 */
export function doesHarnessSupportCapabilities(
	harness: HarnessName,
	requiredCapabilities: readonly HarnessCapability[],
): boolean {
	const supported = HARNESS_CAPABILITY_MAP[harness];
	return requiredCapabilities.every((capability) =>
		supported.includes(capability),
	);
}

/** Common options shared across all harness prompt modes. */
interface BaseGenerateOpts {
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

/** Generation options for standard code-output benchmarks. */
interface CodeOutputGenerateOpts extends BaseGenerateOpts {
	/** Prompt handling mode for this benchmark item. */
	promptMode?: "code-output";
	/** Optional working directory for tool-calling harnesses. */
	workingDirectory?: string;
}

/** Generation options for workspace-scored benchmarks. */
interface WorkspaceGenerateOpts extends BaseGenerateOpts {
	/** Workspace mode always requires a caller-supplied working directory. */
	promptMode: "workspace";
	/** Isolated workspace root passed in by the runner. */
	workingDirectory: string;
}

/** Options for generating a completion. */
export type GenerateOpts = CodeOutputGenerateOpts | WorkspaceGenerateOpts;

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
	/** Optional benchmark signal assessment derived at the harness boundary. */
	signalAssessment?: SignalAssessment;
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
