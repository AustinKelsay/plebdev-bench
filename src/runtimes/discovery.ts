/**
 * Purpose: Discover available runtimes on the system.
 * Exports: discoverRuntimes, isRuntimeAvailable
 *
 * Checks for:
 * - Ollama: HTTP endpoint reachable at configured URL
 * - vLLM: HTTP endpoint reachable at configured URL
 */

import type { RuntimeName } from "./runtime.js";
import { createOllamaRuntime } from "./ollama-runtime.js";
import { createVllmRuntime } from "./vllm-runtime.js";
import { logger } from "../lib/logger.js";

/** Configuration for runtime discovery. */
export interface RuntimeDiscoveryConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
	/** vLLM API base URL. */
	vllmBaseUrl: string;
	/** Timeout for discovery checks in milliseconds. */
	timeoutMs: number;
}

/**
 * Check if a specific runtime is available.
 *
 * @param name - Runtime name to check
 * @param config - Discovery configuration
 * @returns true if the runtime is available
 */
export async function isRuntimeAvailable(
	name: RuntimeName,
	config: RuntimeDiscoveryConfig,
): Promise<boolean> {
	switch (name) {
		case "ollama": {
			const runtime = createOllamaRuntime({
				baseUrl: config.ollamaBaseUrl,
				defaultTimeoutMs: config.timeoutMs,
			});
			return runtime.ping();
		}
		case "vllm": {
			const runtime = createVllmRuntime({
				baseUrl: config.vllmBaseUrl,
				defaultTimeoutMs: config.timeoutMs,
				apiKey: process.env.VLLM_API_KEY,
			});
			return runtime.ping();
		}
		default:
			return false;
	}
}

/**
 * Discover all available runtimes on the system.
 *
 * @param config - Discovery configuration
 * @returns Array of available runtime names
 */
export async function discoverRuntimes(
	config: RuntimeDiscoveryConfig,
): Promise<RuntimeName[]> {
	const available: RuntimeName[] = [];

	// Check Ollama
	const ollamaAvailable = await isRuntimeAvailable("ollama", config);
	if (ollamaAvailable) {
		available.push("ollama");
	} else {
		logger.debug({ baseUrl: config.ollamaBaseUrl }, "Ollama runtime not available");
	}

	// Check vLLM
	const vllmAvailable = await isRuntimeAvailable("vllm", config);
	if (vllmAvailable) {
		available.push("vllm");
	} else {
		logger.debug({ baseUrl: config.vllmBaseUrl }, "vLLM runtime not available");
	}

	return available;
}
