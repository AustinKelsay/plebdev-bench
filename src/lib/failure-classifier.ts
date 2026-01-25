/**
 * Purpose: Classify error messages into failure types.
 * Exports: classifyGenerationError, classifyScoringError
 *
 * Error classification is based on pattern matching error messages.
 * This keeps classification logic centralized and testable.
 */

import type { GenerationFailureType, ScoringFailureType } from "../schemas/index.js";

/**
 * Classifies a generation error message into a failure type.
 *
 * @param errorMessage - The error message from harness/execution
 * @returns The classified failure type
 *
 * @example
 * ```typescript
 * classifyGenerationError("Request timed out after 60s") // => "timeout"
 * classifyGenerationError("Empty output received") // => "harness_error"
 * ```
 */
export function classifyGenerationError(errorMessage: string): GenerationFailureType {
	const lower = errorMessage.toLowerCase();

	// Timeout patterns
	if (lower.includes("timed out") || lower.includes("timeout")) {
		return "timeout";
	}

	// Prompt file not found
	if (lower.includes("prompt file not found") || lower.includes("prompt not found")) {
		return "prompt_not_found";
	}

	// API/HTTP error patterns
	if (
		(lower.includes("failed:") && (lower.includes("4") || lower.includes("5"))) ||
		lower.includes("status") ||
		lower.includes("http") ||
		lower.includes("fetch") ||
		lower.includes("network") ||
		lower.includes("connection")
	) {
		return "api_error";
	}

	// Harness-specific errors (empty output, too short, CLI failure)
	if (
		lower.includes("empty output") ||
		lower.includes("output too short") ||
		lower.includes("no output") ||
		lower.includes("not recognized") ||
		lower.includes("command failed") ||
		lower.includes("exit code")
	) {
		return "harness_error";
	}

	return "unknown";
}

/**
 * Classifies a scoring error message into a failure phase.
 *
 * @param errorMessage - The error message from scoring
 * @returns The classified scoring failure type
 *
 * @example
 * ```typescript
 * classifyScoringError("Code extraction failed: no code blocks") // => "extraction"
 * classifyScoringError("Import failed: SyntaxError") // => "import"
 * ```
 */
export function classifyScoringError(errorMessage: string): ScoringFailureType {
	const lower = errorMessage.toLowerCase();

	if (lower.includes("no scoring spec found")) {
		return "no_spec";
	}

	if (lower.includes("code extraction failed")) {
		return "extraction";
	}

	if (lower.includes("failed to load scoring spec")) {
		return "spec_load";
	}

	if (lower.includes("import failed")) {
		return "import";
	}

	if (
		lower.includes("missing export") ||
		lower.includes("failed to create instance") ||
		lower.includes("not found or not a function")
	) {
		return "export_validation";
	}

	// Test execution failures (value mismatch, runtime errors during test)
	if (lower.includes("value mismatch") || lower.includes("test case")) {
		return "test_execution";
	}

	return "unknown";
}
