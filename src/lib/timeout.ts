/**
 * Purpose: Calculate dynamic timeouts based on model size and precision.
 * Exports: calculateTimeout
 *
 * Timeout formula:
 * - Base: 60s (for small models and setup overhead)
 * - Per 10B params: ceil(params/10) * 60s (scales with model size)
 * - CLI overhead: Goose=60s, OpenCode=dynamic (60s + params/10 * 30s)
 * - High-precision multiplier: 5x for bf16/fp16/f32 (slow cold start + generation)
 *
 * Examples (base + sizeScaling + harnessOverhead + largeModelOverhead):
 * - 3B model on Ollama: 60 + 60 + 0 + 0 = 120s (2 min)
 * - 9B bf16 on Ollama: (60 + 60 + 0 + 0) * 5 = 600s (10 min)
 * - 30B model on Ollama: 60 + 180 + 0 + 300 = 540s (9 min)
 * - 30B model on Goose: 60 + 180 + 60 + 300 = 600s (10 min)
 * - 3B model on OpenCode: 60 + 60 + 69 + 0 = 189s (~3 min)
 * - 30B model on OpenCode: 60 + 180 + 150 + 300 = 690s (~11.5 min)
 */

import type { HarnessName } from "../harnesses/harness.js";

/** Base timeout in milliseconds (1 minute). */
const BASE_TIMEOUT_MS = 60_000;

/** Additional timeout per 10 billion parameters in milliseconds (1 minute). */
const PER_10B_TIMEOUT_MS = 60_000;

/** Additional overhead for Goose CLI in milliseconds (1 minute). */
const GOOSE_OVERHEAD_MS = 60_000;

/** Additional overhead for large models (>20B) in milliseconds (5 minutes). */
const LARGE_MODEL_OVERHEAD_MS = 300_000;

/** Base overhead for OpenCode in milliseconds (1 minute). */
const OPENCODE_BASE_OVERHEAD_MS = 60_000;

/** Additional overhead per 10B params for OpenCode in milliseconds (30s). */
const OPENCODE_PER_10B_OVERHEAD_MS = 30_000;

/** Maximum timeout cap in milliseconds (20 minutes). */
const MAX_TIMEOUT_MS = 20 * 60_000;

/** Minimum timeout floor in milliseconds (1 minute). */
const MIN_TIMEOUT_MS = 60_000;

/** Multiplier for high-precision formats (bf16, fp16, f32) - accounts for cold start + slow generation. */
const HIGH_PRECISION_MULTIPLIER = 5;

/**
 * Checks if model tag indicates high-precision format.
 *
 * @param modelTag - Model tag (e.g., "llama3:bf16", "qwen:fp16")
 * @returns true if high-precision (bf16, fp16, f32)
 */
function isHighPrecisionModel(modelTag: string): boolean {
	const tag = modelTag.toLowerCase();
	return tag.includes("bf16") || tag.includes("fp16") || tag.includes("f32");
}

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
 * @param modelTag - Model tag for quantization detection (e.g., "llama3:bf16")
 * @returns Calculated timeout in milliseconds
 */
export function calculateTimeout(
	parametersBillions: number,
	harness: HarnessName,
	baseTimeoutMs?: number,
	modelTag?: string,
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

	// Apply high-precision multiplier for bf16/fp16/f32 models (slow cold start + generation)
	if (modelTag && isHighPrecisionModel(modelTag)) {
		timeout *= HIGH_PRECISION_MULTIPLIER;
	}

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
