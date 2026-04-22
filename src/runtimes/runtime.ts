/**
 * Purpose: Runtime interface and types for inference backends.
 * Exports: Runtime, RuntimeName, RUNTIME_NAMES, ModelInfo
 *
 * A Runtime represents an inference backend for active benchmark execution.
 * Runtimes are responsible for:
 * - Health checks (ping)
 * - Model discovery (listModels)
 * - Model metadata (getModelInfo)
 *
 * Harnesses use runtimes to perform inference via different interfaces.
 */

import { supportedRuntimeNames } from "../schemas/common.schema.js";
import type { SupportedRuntimeName } from "../schemas/common.schema.js";

/** Supported runtime names. */
export const RUNTIME_NAMES = supportedRuntimeNames;
export type RuntimeName = SupportedRuntimeName;

/** API formats for generation requests. */
export const API_FORMATS = ["ollama"] as const;
export type ApiFormat = (typeof API_FORMATS)[number];

/** Model information from a runtime. */
export interface ModelInfo {
	/** Model name. */
	name: string;
	/** Model size in bytes (estimated). */
	sizeBytes: number;
	/** Estimated parameter count in billions. */
	parametersBillions: number;
	/** Coarse model kind for benchmark eligibility decisions. */
	modelKind?: "text-generation" | "embedding" | "unknown";
	/** Runtime-reported or inferred model capabilities. */
	capabilities?: {
		generateText: boolean;
		embedText: boolean;
	};
	/** Best-effort raw metadata used for diagnostics and plan exclusions. */
	metadata?: {
		family?: string;
		families?: string[];
		architecture?: string;
	};
}

/**
 * Runtime interface for inference backends.
 *
 * Each runtime provides model discovery and health checks.
 * Harnesses use runtimes to generate completions.
 */
export interface Runtime {
	/** Runtime identifier (e.g., "ollama"). */
	readonly name: RuntimeName;

	/** Base URL for the runtime API. */
	readonly baseUrl: string;

	/** API format used by this runtime for generation requests. */
	readonly apiFormat: ApiFormat;

	/**
	 * Check if the runtime is available and reachable.
	 * @returns true if the runtime can be used
	 */
	ping(): Promise<boolean>;

	/**
	 * List available models from this runtime.
	 * @returns Array of model names
	 */
	listModels(): Promise<string[]>;

	/**
	 * Get information about a specific model.
	 * @param model - Model name
	 * @returns Model info including size and parameters
	 */
	getModelInfo(model: string): Promise<ModelInfo>;
}
