/**
 * Purpose: Runtime module public API - factory, types, and discovery.
 * Exports: createRuntime, discoverRuntimes, isRuntimeAvailable, Runtime, RuntimeName, etc.
 *
 * Use createRuntime() to get a runtime instance by name.
 * Use discoverRuntimes() to find available runtimes on the system.
 */

// Re-export types
export type { Runtime, RuntimeName, ModelInfo } from "./runtime.js";
export { RUNTIME_NAMES } from "./runtime.js";

// Re-export discovery
export { discoverRuntimes, isRuntimeAvailable } from "./discovery.js";

// Import runtime factories
import type { RuntimeName, Runtime } from "./runtime.js";
import { createOllamaRuntime } from "./ollama-runtime.js";

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
export function createRuntime(name: RuntimeName, config: RuntimeConfig): Runtime {
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
