/**
 * Purpose: Discover available runtimes on the system.
 * Exports: discoverRuntimes, isRuntimeAvailable
 *
 * Checks for:
 * - Ollama: HTTP endpoint reachable at configured URL
 */

import type { RuntimeName } from "./runtime.js";
import { createOllamaRuntime } from "./ollama-runtime.js";

/** Configuration for runtime discovery. */
export interface RuntimeDiscoveryConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
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
	}

	return available;
}
