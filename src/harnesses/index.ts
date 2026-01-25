/**
 * Purpose: Harness module public API - factory, types, and discovery.
 * Exports: createHarness, discoverHarnesses, isHarnessAvailable, Harness, HarnessName, etc.
 *
 * Use createHarness() to get a harness instance by name.
 * Use discoverHarnesses() to find available harnesses on the system.
 */

// Re-export types
export type {
	Harness,
	GenerateOpts,
	GenerateResult,
	HarnessName,
} from "./harness.js";
export { HARNESS_NAMES } from "./harness.js";

// Re-export discovery
export { discoverHarnesses, isHarnessAvailable } from "./discovery.js";

// Import adapters
import type { HarnessName, Harness } from "./harness.js";
import { createOllamaAdapter } from "./ollama-adapter.js";
import { createGooseAdapter } from "./goose-adapter.js";
import { createOpenCodeAdapter } from "./opencode-adapter.js";

/** Configuration for creating a harness. */
export interface HarnessConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
	/** Default timeout in milliseconds. */
	defaultTimeoutMs: number;
}

/**
 * Creates a harness instance by name.
 *
 * @param name - Harness name ("ollama", "goose", or "opencode")
 * @param config - Harness configuration
 * @returns Harness instance
 * @throws {Error} If harness name is unknown
 */
export function createHarness(name: HarnessName, config: HarnessConfig): Harness {
	switch (name) {
		case "ollama":
			return createOllamaAdapter({
				baseUrl: config.ollamaBaseUrl,
				defaultTimeoutMs: config.defaultTimeoutMs,
			});

		case "goose":
			return createGooseAdapter({
				ollamaBaseUrl: config.ollamaBaseUrl,
				defaultTimeoutMs: config.defaultTimeoutMs,
			});

		case "opencode":
			return createOpenCodeAdapter({
				ollamaBaseUrl: config.ollamaBaseUrl,
				defaultTimeoutMs: config.defaultTimeoutMs,
			});

		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = name;
			throw new Error(`Unknown harness: ${_exhaustive}`);
		}
	}
}
