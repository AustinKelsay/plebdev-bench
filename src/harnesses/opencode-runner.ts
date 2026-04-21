/**
 * Purpose: Execute OpenCode CLI runs with timeout, stale-output detection, and cleanup.
 * Exports: OpenCodeRunConfig, OpenCodeCommandResult,
 *          computeOpenCodeStaleOutputTimeoutMs, runOpenCodeCommand
 *
 * Invariants:
 * - stdout/stderr streams are captured before returning.
 * - Process-tree cleanup is best-effort on timeout or stale output.
 * - Timeout and hang errors have deterministic messages for failure classification.
 */

import { type ResultPromise, execa } from "execa";
import type pino from "pino";

const STALE_CHECK_INTERVAL_MS = 30_000;
const MIN_STALE_OUTPUT_TIMEOUT_MS = 120_000;
const MAX_STALE_OUTPUT_TIMEOUT_MS = 300_000;
const FORCE_KILL_DELAY_MS = 2_000;

/** Inputs for a single `opencode run` process. */
export interface OpenCodeRunConfig {
	/** CLI args passed after `opencode`. */
	args: string[];
	/** Environment for the OpenCode process. */
	env: Record<string, string>;
	/** Working directory for process execution. */
	cwd: string;
	/** Overall timeout in milliseconds. */
	timeoutMs: number;
	/** Logger for process lifecycle diagnostics. */
	log: pino.Logger;
}

/** Captured OpenCode process result. */
export interface OpenCodeCommandResult {
	/** Captured stdout text. */
	stdout: string;
	/** Captured stderr text. */
	stderr: string;
	/** Process exit code, or null when unavailable. */
	exitCode: number | null;
}

/**
 * Computes the no-output timeout threshold for OpenCode runs.
 *
 * @param timeoutMs - Overall generation timeout
 * @returns Stale-output threshold in milliseconds
 * @throws {RangeError} If timeoutMs is not a finite positive number
 */
export function computeOpenCodeStaleOutputTimeoutMs(timeoutMs: number): number {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new RangeError("timeoutMs must be a finite positive number");
	}
	const halfTimeout = Math.floor(timeoutMs * 0.5);
	return Math.min(
		MAX_STALE_OUTPUT_TIMEOUT_MS,
		Math.max(MIN_STALE_OUTPUT_TIMEOUT_MS, halfTimeout),
	);
}

async function forceKillProcess(
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
		process.kill(pid, 0);
	} catch {
		return;
	}

	log.warn({ pid }, "Process still alive after SIGTERM, killing process tree");

	await execa("pkill", ["-9", "-P", String(pid)], { reject: false }).catch(
		() => {},
	);
	await execa("kill", ["-9", String(pid)], { reject: false }).catch(() => {});
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Process may have exited between checks.
	}
}

/**
 * Runs the OpenCode CLI and returns captured stdout/stderr.
 *
 * @param config - OpenCode command config
 * @returns Captured process output and exit code
 * @throws {Error} If OpenCode times out, appears hung, is aborted, or process execution fails
 */
export async function runOpenCodeCommand(
	config: OpenCodeRunConfig,
): Promise<OpenCodeCommandResult> {
	const controller = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let staleCheckId: ReturnType<typeof setInterval> | undefined;
	let lastOutputTime = Date.now();
	let timedOut = false;
	let staleKilled = false;
	const staleTimeoutMs = computeOpenCodeStaleOutputTimeoutMs(config.timeoutMs);
	let killAttempted = false;

	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const proc = execa("opencode", config.args, {
		env: config.env,
		cwd: config.cwd,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		cancelSignal: controller.signal,
		reject: false,
	});
	const pid = proc.pid;
	config.log.debug({ pid }, "OpenCode process started");

	proc.stdout?.on("data", (chunk: Buffer) => {
		lastOutputTime = Date.now();
		stdoutChunks.push(chunk.toString());
	});
	proc.stderr?.on("data", (chunk: Buffer) => {
		lastOutputTime = Date.now();
		stderrChunks.push(chunk.toString());
	});

	try {
		const timeoutPromise: Promise<never> = new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				if (killAttempted) return;
				killAttempted = true;
				timedOut = true;
				if (staleCheckId) clearInterval(staleCheckId);
				void forceKillProcess(
					proc,
					pid,
					config.log,
					`timeout after ${config.timeoutMs}ms`,
				);
				controller.abort();
				reject(
					new Error(
						`OpenCode timed out after ${Math.round(config.timeoutMs / 1000)}s. Try increasing --timeout.`,
					),
				);
			}, config.timeoutMs);
		});

		const stalePromise: Promise<never> = new Promise((_, reject) => {
			staleCheckId = setInterval(() => {
				if (killAttempted) return;
				const staleDuration = Date.now() - lastOutputTime;
				if (staleDuration <= staleTimeoutMs) return;

				killAttempted = true;
				staleKilled = true;
				if (timeoutId) clearTimeout(timeoutId);
				void forceKillProcess(
					proc,
					pid,
					config.log,
					`no output for ${staleDuration}ms`,
				);
				controller.abort();
				reject(
					new Error(
						`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
					),
				);
			}, STALE_CHECK_INTERVAL_MS);
		});

		const result = await Promise.race([proc, timeoutPromise, stalePromise]);

		return {
			stdout: stdoutChunks.join(""),
			stderr: stderrChunks.join(""),
			exitCode: result.exitCode ?? null,
		};
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			if (timedOut) {
				throw new Error(
					`OpenCode timed out after ${Math.round(config.timeoutMs / 1000)}s. Try increasing --timeout.`,
				);
			}
			if (staleKilled) {
				throw new Error(
					`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
				);
			}
			throw new Error("OpenCode was aborted");
		}
		throw error;
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		if (staleCheckId) clearInterval(staleCheckId);
	}
}
