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

function killOpenCodeProcess(
	proc: ResultPromise,
	signal: NodeJS.Signals,
	log: pino.Logger,
): void {
	try {
		proc.kill(signal);
	} catch (error) {
		log.warn(
			{
				pid: proc.pid,
				signal,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to signal OpenCode process",
		);
	}
}

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

function readErrorTextProperty(error: unknown, key: string): string {
	const record =
		typeof error === "object" && error !== null
			? (error as Record<string, unknown>)
			: undefined;
	const value = record?.[key];
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value
			.filter((part): part is string => typeof part === "string")
			.join("\n");
	}
	return "";
}

function readErrorDurationMs(
	error: unknown,
	fallbackDurationMs: number,
): number {
	const record =
		typeof error === "object" && error !== null
			? (error as Record<string, unknown>)
			: undefined;
	return typeof record?.durationMs === "number" &&
		Number.isFinite(record.durationMs)
		? record.durationMs
		: fallbackDurationMs;
}

function buildOpenCodeCommandError(
	message: string,
	startTime: number,
	stdoutChunks: readonly string[],
	stderrChunks: readonly string[],
	cause?: unknown,
): Error {
	const stdout =
		stdoutChunks.join("") || readErrorTextProperty(cause, "stdout");
	const stderr =
		stderrChunks.join("") || readErrorTextProperty(cause, "stderr");
	const capturedOutput = [stdout, stderr]
		.filter((part) => part.trim().length > 0)
		.join("\n");
	const output = capturedOutput || readErrorTextProperty(cause, "output");
	const durationMs = readErrorDurationMs(
		cause,
		Math.round(performance.now() - startTime),
	);

	return Object.assign(
		new Error(message, cause instanceof Error ? { cause } : {}),
		{
			durationMs,
			...(output.trim().length > 0 ? { output } : {}),
			...(stdout.trim().length > 0 ? { stdout } : {}),
			...(stderr.trim().length > 0 ? { stderr } : {}),
		},
	);
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
	log: pino.Logger,
	reason: string,
): Promise<void> {
	const pid = proc.pid;
	log.warn({ pid, reason }, "Force killing OpenCode process");
	killOpenCodeProcess(proc, "SIGTERM", log);
	await new Promise((resolve) => setTimeout(resolve, FORCE_KILL_DELAY_MS));
	log.warn({ pid }, "Escalating OpenCode process kill");
	killOpenCodeProcess(proc, "SIGKILL", log);
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
	const startTime = performance.now();
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

	async function forceKillAndReject(
		reject: (reason?: unknown) => void,
		reason: string,
		message: string,
	): Promise<void> {
		try {
			await forceKillProcess(proc, config.log, reason);
		} catch (error) {
			config.log.error({ err: error, reason }, "OpenCode process kill failed");
		}
		controller.abort();
		reject(
			buildOpenCodeCommandError(message, startTime, stdoutChunks, stderrChunks),
		);
	}

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
				void forceKillAndReject(
					reject,
					`timeout after ${config.timeoutMs}ms`,
					`OpenCode timed out after ${Math.round(config.timeoutMs / 1000)}s. Try increasing --timeout.`,
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
				void forceKillAndReject(
					reject,
					`no output for ${staleDuration}ms`,
					`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
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
				throw buildOpenCodeCommandError(
					`OpenCode timed out after ${Math.round(config.timeoutMs / 1000)}s. Try increasing --timeout.`,
					startTime,
					stdoutChunks,
					stderrChunks,
					error,
				);
			}
			if (staleKilled) {
				throw buildOpenCodeCommandError(
					`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
					startTime,
					stdoutChunks,
					stderrChunks,
					error,
				);
			}
			throw buildOpenCodeCommandError(
				"OpenCode was aborted",
				startTime,
				stdoutChunks,
				stderrChunks,
				error,
			);
		}
		throw buildOpenCodeCommandError(
			error instanceof Error ? error.message : String(error),
			startTime,
			stdoutChunks,
			stderrChunks,
			error,
		);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		if (staleCheckId) clearInterval(staleCheckId);
	}
}
