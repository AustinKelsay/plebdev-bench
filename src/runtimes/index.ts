/**
 * Purpose: Runtime module public API - factory, types, and discovery.
 * Exports: createRuntime, discoverRuntimes, isRuntimeAvailable, Runtime, RuntimeName, etc.
 *
 * Use createRuntime() to get a runtime instance by name.
 * Use discoverRuntimes() to find available runtimes on the system.
 */

// Re-export types
export type { Runtime, RuntimeName, ModelInfo, ApiFormat } from "./runtime.js";
export { RUNTIME_NAMES, API_FORMATS } from "./runtime.js";

// Re-export discovery
export { discoverRuntimes, isRuntimeAvailable } from "./discovery.js";

import { createOllamaRuntime } from "./ollama-runtime.js";
// Import runtime factories
import type { Runtime, RuntimeName } from "./runtime.js";
import { createVllmRuntime } from "./vllm-runtime.js";

/** Configuration for creating a runtime. */
export interface RuntimeConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
	/** vLLM API base URL. */
	vllmBaseUrl: string;
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

		case "vllm":
			return createVllmRuntime({
				baseUrl: config.vllmBaseUrl,
				defaultTimeoutMs: config.defaultTimeoutMs,
				apiKey: process.env.VLLM_API_KEY,
			});

		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = name;
			throw new Error(`Unknown runtime: ${_exhaustive}`);
		}
	}
}
