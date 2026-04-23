/**
 * Purpose: Regression tests for OpenCode runner timeout/stale resolution races.
 * Exports: none
 *
 * Invariants:
 * - A process that settles after timeout or stale-kill begins must still fail.
 * - Timers are fake and execa is fully mocked.
 */

import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execaMock = vi.hoisted(() => vi.fn());

vi.mock("execa", () => ({
	execa: execaMock,
}));

function createResolvingProcess(resolveAfterMs: number) {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const kill = vi.fn();
	const proc = new Promise<{ exitCode: number | null }>((resolve) => {
		setTimeout(() => resolve({ exitCode: 0 }), resolveAfterMs);
	}) as Promise<{ exitCode: number | null }> & {
		pid: number;
		stdout: PassThrough;
		stderr: PassThrough;
		kill: typeof kill;
	};
	proc.pid = 123;
	proc.stdout = stdout;
	proc.stderr = stderr;
	proc.kill = kill;
	return { proc, kill };
}

describe("runOpenCodeCommand race handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetModules();
		execaMock.mockReset();
	});

	afterEach(async () => {
		await vi.runOnlyPendingTimersAsync();
		vi.useRealTimers();
	});

	it("rejects if the process resolves after timeout handling has started", async () => {
		const { proc, kill } = createResolvingProcess(1_100);
		execaMock.mockReturnValue(proc);
		const { runOpenCodeCommand } = await import(
			"../src/harnesses/opencode-runner.js"
		);

		const runPromise = runOpenCodeCommand({
			args: ["run"],
			env: {},
			cwd: "/tmp",
			timeoutMs: 1_000,
			log: {
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			} as never,
		}).then(
			() => null,
			(error) => error as Error,
		);

		await vi.advanceTimersByTimeAsync(1_100);

		const error = await runPromise;
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain("OpenCode timed out after 1s");
		expect(kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("rejects if the process resolves after stale-output handling has started", async () => {
		const { proc, kill } = createResolvingProcess(181_000);
		execaMock.mockReturnValue(proc);
		const { runOpenCodeCommand } = await import(
			"../src/harnesses/opencode-runner.js"
		);

		const runPromise = runOpenCodeCommand({
			args: ["run"],
			env: {},
			cwd: "/tmp",
			timeoutMs: 300_000,
			log: {
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			} as never,
		}).then(
			() => null,
			(error) => error as Error,
		);

		await vi.advanceTimersByTimeAsync(181_000);

		const error = await runPromise;
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain(
			"OpenCode hung (no output for 150s). Process may be stuck on backend.",
		);
		expect(kill).toHaveBeenCalledWith("SIGTERM");
	});
});
