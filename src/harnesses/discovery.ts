/**
 * Purpose: Discover available harnesses on the system.
 * Exports: discoverHarnesses, isHarnessAvailable
 *
 * Checks for:
 * - Ollama: HTTP endpoint reachable
 * - Goose: CLI available via `which goose`
 * - OpenCode: CLI available via `which opencode`
 *
 * All harnesses require Ollama as the backend provider.
 */

import { execa } from "execa";
import type { HarnessName } from "./harness.js";
import { createOllamaAdapter } from "./ollama-adapter.js";

/** Configuration for harness discovery. */
export interface DiscoveryConfig {
	/** Ollama API base URL. */
	ollamaBaseUrl: string;
	/** Timeout for discovery checks in milliseconds. */
	timeoutMs: number;
}

/**
 * Check if a specific CLI is available on the system.
 *
 * @param cli - CLI name to check (e.g., "goose", "opencode")
 * @returns true if the CLI is available
 */
async function isCliAvailable(cli: string): Promise<boolean> {
	try {
		await execa("which", [cli], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a specific harness is available.
 *
 * @param name - Harness name to check
 * @param config - Discovery configuration
 * @returns true if the harness is available
 */
export async function isHarnessAvailable(
	name: HarnessName,
	config: DiscoveryConfig,
): Promise<boolean> {
	const ollamaAdapter = createOllamaAdapter({
		baseUrl: config.ollamaBaseUrl,
		defaultTimeoutMs: config.timeoutMs,
	});

	// All harnesses require Ollama as backend
	const ollamaAvailable = await ollamaAdapter.ping();
	if (!ollamaAvailable && name !== "ollama") {
		// CLI harnesses need Ollama running
		return false;
	}

	switch (name) {
		case "ollama":
			return ollamaAvailable;
		case "goose":
			return ollamaAvailable && (await isCliAvailable("goose"));
		case "opencode":
			return ollamaAvailable && (await isCliAvailable("opencode"));
		default:
			return false;
	}
}

/**
 * Discover all available harnesses on the system.
 *
 * @param config - Discovery configuration
 * @returns Array of available harness names
 */
export async function discoverHarnesses(
	config: DiscoveryConfig,
): Promise<HarnessName[]> {
	const available: HarnessName[] = [];

	// Check Ollama first (required for all)
	const ollamaAdapter = createOllamaAdapter({
		baseUrl: config.ollamaBaseUrl,
		defaultTimeoutMs: config.timeoutMs,
	});

	const ollamaAvailable = await ollamaAdapter.ping();
	if (!ollamaAvailable) {
		// No Ollama = no harnesses available
		return [];
	}

	available.push("ollama");

	// Check CLI harnesses in parallel
	const [gooseAvailable, opencodeAvailable] = await Promise.all([
		isCliAvailable("goose"),
		isCliAvailable("opencode"),
	]);

	if (gooseAvailable) {
		available.push("goose");
	}

	if (opencodeAvailable) {
		available.push("opencode");
	}

	return available;
}
