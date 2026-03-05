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
export {
	HARNESS_NAMES,
	LEGACY_HARNESS_ALIAS,
	normalizeHarnessName,
	isValidHarnessName,
	HARNESS_RUNTIME_COMPATIBILITY,
	isHarnessCompatibleWithRuntime,
	getCompatibleHarnesses,
} from "./harness.js";

// Re-export discovery
export { discoverHarnesses, isHarnessAvailable } from "./discovery.js";

import { logger } from "../lib/logger.js";
import { createDirectAdapter } from "./direct-adapter.js";
import {
	type GooseAdapterOptions,
	createGooseAdapter,
} from "./goose-adapter.js";
// Import adapters
import type { Harness, HarnessName } from "./harness.js";
import { LEGACY_HARNESS_ALIAS, normalizeHarnessName } from "./harness.js";
import { createOpenCodeAdapter } from "./opencode-adapter.js";

/** Optional factory settings for harness adapter creation. */
export interface HarnessFactoryOptions {
	/** Goose-specific adapter settings. */
	goose?: GooseAdapterOptions;
}

/**
 * Creates a harness instance by name.
 *
 * @param name - Harness name ("direct", "goose", "opencode", or legacy "ollama")
 * @param options - Optional adapter settings
 * @returns Harness instance
 * @throws {Error} If harness name is unknown
 */
export function createHarness(
	name: string,
	options?: HarnessFactoryOptions,
): Harness {
	// Handle legacy "ollama" name with deprecation warning
	if (name === LEGACY_HARNESS_ALIAS) {
		logger.warn(
			{ legacyName: name, newName: "direct" },
			'Harness name "ollama" is deprecated, use "direct" instead',
		);
	}

	const normalizedName = normalizeHarnessName(name);

	switch (normalizedName) {
		case "direct":
			return createDirectAdapter();

		case "goose":
			return createGooseAdapter(options?.goose);

		case "opencode":
			return createOpenCodeAdapter();

		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = normalizedName;
			throw new Error(`Unknown harness: ${_exhaustive}`);
		}
	}
}
