/**
 * Purpose: Runtime module public API for active benchmark execution.
 * Exports: createRuntime, Runtime, RuntimeName, etc.
 *
 * Invariants:
 * - createRuntime returns an Ollama runtime whose apiFormat is "ollama".
 * - Unknown runtime names throw.
 */

import { createOllamaRuntime } from "./ollama-runtime.js";
import type { Runtime, RuntimeName } from "./runtime.js";

// Re-export types/constants for a stable import path.
export type { Runtime, RuntimeName, ModelInfo, ApiFormat } from "./runtime.js";
export { RUNTIME_NAMES, API_FORMATS } from "./runtime.js";

/** Configuration for creating a runtime. */
export interface RuntimeConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
	/** Default timeout in milliseconds. */
	defaultTimeoutMs: number;
}

/**
 * Creates a runtime instance by name.
 *
 * @param name - Runtime name ("ollama")
 * @param config - Runtime configuration
 * @returns Runtime instance
 * @throws {Error} If runtime name is unknown
 */
export function createRuntime(
	name: RuntimeName,
	config: RuntimeConfig,
): Runtime {
	switch (name) {
		case "ollama":
			return createOllamaRuntime({
				baseUrl: config.ollamaBaseUrl,
				defaultTimeoutMs: config.defaultTimeoutMs,
			});

		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = name;
			throw new Error(`Unknown runtime: ${_exhaustive}`);
		}
	}
}
