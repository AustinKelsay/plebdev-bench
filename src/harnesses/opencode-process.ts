/**
 * Purpose: OpenCode process lifecycle helpers (timeouts, stale output kills).
 * Exports: forceKillProcess, computeStaleOutputTimeoutMs
 *
 * OpenCode can spawn child processes; Node's `process.kill()` cannot kill the
 * full process tree reliably. This module provides best-effort tree kill logic
 * and a derived stale-output timeout for "hung" detection.
 *
 * Invariants:
 * - `forceKillProcess` is best-effort and must not throw on already-dead PIDs
 * - `computeStaleOutputTimeoutMs` never returns less than the minimum threshold
 */

import { type ResultPromise, execa } from "execa";
import type pino from "pino";

/** Minimum time without output before considering process hung (ms). */
const STALE_OUTPUT_TIMEOUT_MS = 120_000;

/** Maximum time without output before considering process hung (ms). */
const MAX_STALE_OUTPUT_TIMEOUT_MS = 300_000;

/** Delay after SIGTERM before sending SIGKILL (ms). */
const FORCE_KILL_DELAY_MS = 2_000;

/**
 * Forcefully kills a process and its entire process tree.
 *
 * @param proc - The execa process to kill
 * @param pid - Process ID (for logging and process-tree killing)
 * @param log - Logger instance
 * @param reason - Reason for killing (for logging)
 */
export async function forceKillProcess(
	proc: ResultPromise,
	pid: number | undefined,
	log: pino.Logger,
	reason: string,
): Promise<void> {
	log.warn({ pid, reason }, "Force killing OpenCode process");

	proc.kill("SIGTERM");
	await new Promise((resolve) => setTimeout(resolve, FORCE_KILL_DELAY_MS));

	if (!pid) return;

	try {
		// throws if dead
		process.kill(pid, 0);
	} catch {
		return;
	}

	log.warn({ pid }, "Process still alive after SIGTERM, killing process tree");

	try {
		await execa("pkill", ["-9", "-P", String(pid)], { reject: false });
	} catch {
		// ignore
	}

	try {
		await execa("kill", ["-9", String(pid)], { reject: false });
	} catch {
		// ignore
	}

	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// ignore
	}
}

/**
 * Computes a dynamic stale-output timeout based on the overall request timeout.
 *
 * @param timeoutMs - Overall generation timeout
 * @returns Timeout in milliseconds for stale-output detection
 */
export function computeStaleOutputTimeoutMs(timeoutMs: number): number {
	const halfTimeout = Math.floor(timeoutMs * 0.5);
	return Math.min(
		MAX_STALE_OUTPUT_TIMEOUT_MS,
		Math.max(STALE_OUTPUT_TIMEOUT_MS, halfTimeout),
	);
}
