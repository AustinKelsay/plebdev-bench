/**
 * Purpose: Calculate dynamic timeouts based on model size.
 * Exports: calculateTimeout
 *
 * Timeout formula:
 * - Base: 60s (for small models and setup overhead)
 * - Per 10B params: ceil(params/10) * 60s (scales with model size)
 * - CLI overhead: Goose=60s, OpenCode=dynamic (60s + params/10 * 30s)
 *
 * Examples (base + sizeScaling + harnessOverhead):
 * - 3B model on Ollama: 60 + 60 + 0 + 0 = 120s (2 min)
 * - 30B model on Ollama: 60 + 180 + 0 + 120 = 360s (6 min)
 * - 30B model on Goose: 60 + 180 + 60 + 120 = 420s (7 min)
 * - 3B model on OpenCode: 60 + 60 + 69 = 189s (~3 min)
 * - 30B model on OpenCode: 60 + 180 + 150 + 120 = 510s (~8.5 min)
 */

import type { HarnessName } from "../harnesses/harness.js";

/** Base timeout in milliseconds (1 minute). */
const BASE_TIMEOUT_MS = 60_000;

/** Additional timeout per 10 billion parameters in milliseconds (1 minute). */
const PER_10B_TIMEOUT_MS = 60_000;

/** Additional overhead for Goose CLI in milliseconds (1 minute). */
const GOOSE_OVERHEAD_MS = 60_000;

/** Additional overhead for large models (>20B) in milliseconds (2 minutes). */
const LARGE_MODEL_OVERHEAD_MS = 120_000;

/** Base overhead for OpenCode in milliseconds (1 minute). */
const OPENCODE_BASE_OVERHEAD_MS = 60_000;

/** Additional overhead per 10B params for OpenCode in milliseconds (30s). */
const OPENCODE_PER_10B_OVERHEAD_MS = 30_000;

/** Maximum timeout cap in milliseconds (20 minutes). */
const MAX_TIMEOUT_MS = 20 * 60_000;

/** Minimum timeout floor in milliseconds (1 minute). */
const MIN_TIMEOUT_MS = 60_000;

/**
 * Calculates OpenCode overhead based on model size.
 * Formula: 60s + (params/10 * 30s)
 *
 * Examples:
 * - 3B model: 60 + 9 = 69s (~1 min)
 * - 7B model: 60 + 21 = 81s (~1.5 min)
 * - 14B model: 60 + 42 = 102s (~1.7 min)
 * - 30B model: 60 + 90 = 150s (2.5 min)
 * - 70B model: 60 + 210 = 270s (4.5 min)
 *
 * @param parametersBillions - Model size in billions
 * @returns Overhead in milliseconds
 */
function calculateOpenCodeOverhead(parametersBillions: number): number {
	const scaleFactor = parametersBillions / 10;
	return OPENCODE_BASE_OVERHEAD_MS + scaleFactor * OPENCODE_PER_10B_OVERHEAD_MS;
}

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
		// Dynamic overhead based on model size (B.4 optimization)
		harnessOverhead = calculateOpenCodeOverhead(parametersBillions);
	}

	// Add extra buffer for large models
	const largeModelOverhead = parametersBillions > 20 ? LARGE_MODEL_OVERHEAD_MS : 0;

	// Calculate total
	let timeout = base + sizeScaling + harnessOverhead + largeModelOverhead;

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
