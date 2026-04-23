/**
 * Purpose: Shared helpers for `bench compare` validation and display.
 * Exports: assertComparableCheckpoints, getCheckpointGuardMessage,
 *          isBenignPlanReadError, readPlanBestEffort, resolveCheckpointId,
 *          truncate, pad, formatTimestamp
 *
 * Invariants:
 * - Checkpoint guard helpers never read from the filesystem.
 * - Invalid plan JSON/schema errors are not treated as benign missing metadata.
 */

import { logger } from "../lib/logger.js";
import { readPlan } from "../results/reader.js";
import type { RunPlan, RunResult } from "../schemas/index.js";

/**
 * Ensures two runs are comparable by checkpoint, unless override is enabled.
 *
 * @param checkpointA - Baseline checkpoint ID
 * @param checkpointB - Comparison checkpoint ID
 * @param allowCrossCheckpoint - Whether to bypass checkpoint guardrails
 * @returns Nothing; throws when checkpoints are not comparable
 * @throws {Error} If checkpoints are missing or mismatched and override is disabled
 */
export function assertComparableCheckpoints(
	checkpointA: string | undefined,
	checkpointB: string | undefined,
	allowCrossCheckpoint: boolean,
): void {
	const message = getCheckpointGuardMessage(
		checkpointA,
		checkpointB,
		allowCrossCheckpoint,
	);
	if (message) {
		throw new Error(message);
	}
}

/**
 * Returns a checkpoint guard error message for CLI flow control.
 *
 * @param checkpointA - Baseline checkpoint ID
 * @param checkpointB - Comparison checkpoint ID
 * @param allowCrossCheckpoint - Whether guardrail bypass is enabled
 * @returns Guard failure message when checkpoints are not comparable
 * @throws {never} This helper only formats validation messages
 */
export function getCheckpointGuardMessage(
	checkpointA: string | undefined,
	checkpointB: string | undefined,
	allowCrossCheckpoint: boolean,
): string | undefined {
	if (allowCrossCheckpoint) {
		return undefined;
	}
	if (!checkpointA || !checkpointB) {
		return "Checkpoint metadata missing in one or both run artifacts. Re-run with --allow-cross-checkpoint to force compare.";
	}
	if (checkpointA !== checkpointB) {
		return `Checkpoint mismatch: ${checkpointA} vs ${checkpointB}. Re-run with --allow-cross-checkpoint to force compare.`;
	}
	return undefined;
}

/**
 * Determines whether a plan-read error is a benign IO condition.
 *
 * @param error - Error thrown from readPlan
 * @returns True when compare should continue without plan metadata
 * @throws {never} This helper only inspects the provided error value
 */
export function isBenignPlanReadError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	if (error && typeof error === "object" && "code" in error) {
		const code = (error as { code?: unknown }).code;
		if (code === "ENOENT" || code === "ENOTDIR") {
			return true;
		}
	}

	if (error instanceof SyntaxError) {
		return false;
	}

	if (error.name === "ZodError") {
		return false;
	}

	if (/schema|validation|invalid json|json parse/i.test(error.message)) {
		return false;
	}

	if (/plan file not found/i.test(error.message)) {
		return true;
	}

	return false;
}

/**
 * Reads `plan.json` for a run directory with best-effort handling.
 *
 * @param runDir - Absolute run directory path
 * @returns Parsed plan when available and valid; undefined only for benign IO/missing-file cases
 * @throws {Error} If `plan.json` is invalid JSON, fails schema validation, or any non-benign read error occurs
 */
export function readPlanBestEffort(runDir: string): RunPlan | undefined {
	try {
		return readPlan(runDir);
	} catch (error) {
		if (!isBenignPlanReadError(error)) {
			throw error;
		}
		logger.warn(
			{
				runDir,
				error: error instanceof Error ? error.message : String(error),
			},
			"Unable to read plan metadata; continuing with run.json metadata",
		);
		return undefined;
	}
}

/**
 * Resolves checkpoint ID from run metadata with plan fallback.
 *
 * @param run - Run result artifact
 * @param plan - Optional run plan artifact
 * @returns Resolved checkpoint ID, if present
 * @throws {never} This helper only reads already-parsed metadata
 */
export function resolveCheckpointId(
	run: RunResult,
	plan: RunPlan | undefined,
): string | undefined {
	return (
		run.benchmarkCheckpoint?.checkpointId ??
		plan?.benchmarkCheckpoint?.checkpointId
	);
}

/**
 * Truncates a string to a maximum display width using an ellipsis.
 *
 * @param str - Input string
 * @param maxLen - Maximum output length
 * @returns Original string or truncated display string
 * @throws {never} This helper only slices the provided string
 */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen - 1)}…`;
}

/**
 * Pads a string to a fixed display width.
 *
 * @param str - Input string
 * @param width - Target width
 * @param align - Padding direction
 * @returns Padded string
 * @throws {never} This helper only pads the provided string
 */
export function pad(
	str: string,
	width: number,
	align: "left" | "right" = "left",
): string {
	if (align === "right") {
		return str.padStart(width);
	}
	return str.padEnd(width);
}

/**
 * Formats an ISO timestamp for compact UTC terminal display.
 *
 * @param iso - ISO timestamp string
 * @returns UTC-based locale-stable display timestamp
 * @throws {never} Invalid dates are rendered as `Invalid Date`
 */
export function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleString("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
	});
}
