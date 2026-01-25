/**
 * Purpose: Common harness interface and types for all adapters.
 * Exports: Harness, GenerateOpts, GenerateResult, HarnessName, HARNESS_NAMES
 *
 * All harnesses implement this interface to provide a unified API for:
 * - Checking availability (ping)
 * - Listing models (from Ollama, shared across harnesses)
 * - Generating completions
 */

/** Supported harness names. */
export const HARNESS_NAMES = ["ollama", "goose", "opencode"] as const;
export type HarnessName = (typeof HARNESS_NAMES)[number];

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
}

/** Model information from Ollama. */
export interface ModelInfo {
	/** Model name. */
	name: string;
	/** Model size in bytes. */
	sizeBytes: number;
	/** Estimated parameter count in billions. */
	parametersBillions: number;
}

/**
 * Common interface for all harness adapters.
 *
 * Each harness provides a way to generate completions from LLMs.
 * All harnesses use Ollama as the backend provider, but differ in
 * how they invoke the model (direct HTTP vs CLI wrapper).
 */
export interface Harness {
	/** Harness identifier (e.g., "ollama", "goose", "opencode"). */
	readonly name: HarnessName;

	/**
	 * Check if the harness is available and reachable.
	 * @returns true if the harness can be used
	 */
	ping(): Promise<boolean>;

	/**
	 * List available models.
	 * All harnesses use Ollama models, so this queries Ollama.
	 * @returns Array of model names
	 */
	listModels(): Promise<string[]>;

	/**
	 * Get information about a specific model.
	 * @param model - Model name
	 * @returns Model info including size
	 */
	getModelInfo(model: string): Promise<ModelInfo>;

	/**
	 * Generate a completion.
	 * @param opts - Generation options
	 * @returns The generation result
	 * @throws {Error} On timeout or execution failure
	 */
	generate(opts: GenerateOpts): Promise<GenerateResult>;
}
