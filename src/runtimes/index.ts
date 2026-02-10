/**
 * Purpose: Runtime module public API - factory, types, and discovery.
 * Exports: createRuntime, discoverRuntimes, isRuntimeAvailable, Runtime, RuntimeName, etc.
 *
 * Use createRuntime() to get a runtime instance by name.
 * Use discoverRuntimes() to find available runtimes on the system.
 *
 * Invariants:
 * - createRuntime returns a Runtime whose apiFormat matches its name.
 * - Unknown runtime names throw.
 */

import { z } from "zod";
import { createOllamaRuntime } from "./ollama-runtime.js";
import type { Runtime, RuntimeName } from "./runtime.js";
import { createVllmRuntime } from "./vllm-runtime.js";

const VllmApiKeySchema = z.string().min(1).optional();
const vllmApiKey = VllmApiKeySchema.parse(process.env.VLLM_API_KEY);

// Re-export types/constants for a stable import path.
export type { Runtime, RuntimeName, ModelInfo, ApiFormat } from "./runtime.js";
export { RUNTIME_NAMES, API_FORMATS } from "./runtime.js";
export { discoverRuntimes, isRuntimeAvailable } from "./discovery.js";

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
				apiKey: vllmApiKey,
			});

		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = name;
			throw new Error(`Unknown runtime: ${_exhaustive}`);
		}
	}
}
