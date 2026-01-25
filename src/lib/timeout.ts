/**
 * Purpose: Calculate dynamic timeouts based on model size.
 * Exports: calculateTimeout
 *
 * Timeout formula:
 * - Base: 60s (for small models and setup overhead)
 * - Per 10B params: 60s (scales with model size)
 * - CLI overhead: Goose=60s, OpenCode=240s (agentic overhead)
 *
 * Examples:
 * - 3B model on Ollama: 60 + 6 = 66s (~1 min)
 * - 30B model on Ollama: 60 + 180 = 240s (4 min)
 * - 30B model on Goose: 240 + 60 = 300s (5 min)
 * - 4B model on OpenCode: 60 + 6 + 240 = 306s (5 min)
 * - 30B model on OpenCode: 60 + 180 + 240 = 480s (8 min)
 */

import type { HarnessName } from "../harnesses/harness.js";

/** Base timeout in milliseconds (1 minute). */
const BASE_TIMEOUT_MS = 60_000;

/** Additional timeout per 10 billion parameters in milliseconds (1 minute). */
const PER_10B_TIMEOUT_MS = 60_000;

/** Additional overhead for Goose CLI in milliseconds (1 minute). */
const GOOSE_OVERHEAD_MS = 60_000;

/** Additional overhead for OpenCode in milliseconds (4 minutes - agentic behavior). */
const OPENCODE_OVERHEAD_MS = 4 * 60_000;

/** Maximum timeout cap in milliseconds (20 minutes). */
const MAX_TIMEOUT_MS = 20 * 60_000;

/** Minimum timeout floor in milliseconds (2 minutes). */
const MIN_TIMEOUT_MS = 2 * 60_000;

/**
 * Calculates dynamic timeout based on model size and harness type.
 *
 * @param parametersBillions - Model size in billions of parameters
 * @param harness - Harness type (ollama, goose, opencode)
 * @param baseTimeoutMs - User-specified base timeout (overrides default)
 * @returns Calculated timeout in milliseconds
 */
export function calculateTimeout(
	parametersBillions: number,
	harness: HarnessName,
	baseTimeoutMs?: number,
): number {
	// Use provided base or default
	const base = baseTimeoutMs ?? BASE_TIMEOUT_MS;

	// Scale by model size (per 10B params)
	const sizeScaling = Math.ceil(parametersBillions / 10) * PER_10B_TIMEOUT_MS;

	// Add harness-specific overhead
	let harnessOverhead = 0;
	if (harness === "goose") {
		harnessOverhead = GOOSE_OVERHEAD_MS;
	} else if (harness === "opencode") {
		harnessOverhead = OPENCODE_OVERHEAD_MS;
	}

	// Calculate total
	let timeout = base + sizeScaling + harnessOverhead;

	// Apply floor and ceiling
	timeout = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, timeout));

	return timeout;
}

/**
 * Formats timeout in human-readable form.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns Formatted string (e.g., "5m", "10m 30s")
 */
export function formatTimeout(timeoutMs: number): string {
	const totalSeconds = Math.round(timeoutMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (seconds === 0) {
		return `${minutes}m`;
	}
	return `${minutes}m ${seconds}s`;
}
