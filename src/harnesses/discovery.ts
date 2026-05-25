/**
 * Purpose: Discover available harnesses on the system.
 * Exports: discoverHarnesses, isHarnessAvailable
 *
 * Checks for:
 * - direct: Always available (runtime availability checked separately)
 * - goose: CLI available via `which goose`
 * - hermes: CLI available and `hermes chat` exposes required flags
 * - opencode: CLI available and `opencode run` exposes required flags
 *
 * Note: Runtime availability (e.g., Ollama) is checked separately.
 */

import { execa } from "execa";
import { logger } from "../lib/logger.js";
import type { HarnessName } from "./harness.js";
import { getHermesRunFeatures, isHermesRunCompatible } from "./hermes-cli.js";
import {
	getOpenCodeRunFeatures,
	isOpenCodeRunCompatible,
} from "./opencode-cli.js";

/** Returns true for expected command-not-found probe failures. */
function isCommandMissingError(error: unknown): boolean {
	const code =
		error && typeof error === "object" && "code" in error
			? (error as { code?: unknown }).code
			: undefined;
	if (code === "ENOENT") return true;
	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: typeof error === "string"
				? error.toLowerCase()
				: "";
	return (
		message.includes("enoent") ||
		message.includes("not found") ||
		message.includes("command not found")
	);
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
 * Checks whether the installed OpenCode CLI supports benchmark run mode.
 *
 * @returns True when OpenCode is installed and exposes required run flags
 */
async function isOpenCodeAvailable(): Promise<boolean> {
	try {
		const features = await getOpenCodeRunFeatures();
		return isOpenCodeRunCompatible(features);
	} catch (error) {
		if (isCommandMissingError(error)) {
			logger.debug(
				{ err: error, probe: "opencode", functionName: "isOpenCodeAvailable" },
				"OpenCode CLI not installed",
			);
			return false;
		}
		logger.warn(
			{ err: error, probe: "opencode", functionName: "isOpenCodeAvailable" },
			"OpenCode probe failed",
		);
		return false;
	}
}

/**
 * Checks whether the installed Hermes CLI supports benchmark run mode.
 *
 * @returns True when Hermes is installed and exposes required run flags
 */
async function isHermesAvailable(): Promise<boolean> {
	try {
		const features = await getHermesRunFeatures();
		return isHermesRunCompatible(features);
	} catch (error) {
		if (isCommandMissingError(error)) {
			logger.debug(
				{ err: error, probe: "hermes", functionName: "isHermesAvailable" },
				"Hermes CLI not installed",
			);
			return false;
		}
		logger.warn(
			{ err: error, probe: "hermes", functionName: "isHermesAvailable" },
			"Hermes probe failed",
		);
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
		case "hermes":
			return isHermesAvailable();
		case "opencode":
			return isOpenCodeAvailable();
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
	const [gooseAvailable, hermesAvailable, opencodeAvailable] =
		await Promise.all([
			isCliAvailable("goose"),
			isHermesAvailable(),
			isOpenCodeAvailable(),
		]);

	if (gooseAvailable) {
		available.push("goose");
	}

	if (hermesAvailable) {
		available.push("hermes");
	}

	if (opencodeAvailable) {
		available.push("opencode");
	}

	return available;
}
