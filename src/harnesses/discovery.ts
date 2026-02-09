/**
 * Purpose: Discover available harnesses on the system.
 * Exports: discoverHarnesses, isHarnessAvailable
 *
 * Checks for:
 * - direct: Always available (runtime availability checked separately)
 * - goose: CLI available via `which goose`
 * - opencode: CLI available via `which opencode`
 *
 * Note: Runtime availability (e.g., Ollama) is checked separately.
 */

import { execa } from "execa";
import type { HarnessName } from "./harness.js";

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
 * @returns true if the harness is available
 */
export async function isHarnessAvailable(name: HarnessName): Promise<boolean> {
	switch (name) {
		case "direct":
			// Direct harness is always available - runtime availability is checked separately
			return true;
		case "goose":
			return isCliAvailable("goose");
		case "opencode":
			return isCliAvailable("opencode");
		default:
			return false;
	}
}

/**
 * Discover all available harnesses on the system.
 *
 * @returns Array of available harness names
 */
export async function discoverHarnesses(): Promise<HarnessName[]> {
	const available: HarnessName[] = [];

	// Direct harness is always available
	available.push("direct");

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
