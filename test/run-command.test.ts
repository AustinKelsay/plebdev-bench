/**
 * Purpose: Regression tests for `bench run` CLI option normalization.
 * Exports: none
 *
 * Invariants:
 * - Runner side effects are mocked.
 * - Deprecated URL aliases must not silently conflict with canonical flags.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	loggerError: vi.fn(),
	loggerWarn: vi.fn(),
	runBenchmark: vi.fn(),
}));

vi.mock("../src/lib/logger.js", () => ({
	logger: {
		error: mocks.loggerError,
		warn: mocks.loggerWarn,
	},
}));

vi.mock("../src/runner/index.js", () => ({
	runBenchmark: mocks.runBenchmark,
}));

import { runCommand } from "../src/cli/run-command.js";

describe("runCommand", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`process.exit(${code})`);
		}) as unknown as ReturnType<typeof vi.spyOn>;
	});

	afterEach(() => {
		exitSpy.mockRestore();
	});

	it("exits non-zero when --ollama-url and --vllm-url conflict", async () => {
		await expect(
			runCommand.parseAsync(
				[
					"--ollama-url",
					"http://localhost:11434",
					"--vllm-url",
					"http://localhost:1234",
				],
				{ from: "user" },
			),
		).rejects.toThrow("process.exit(1)");

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mocks.runBenchmark).not.toHaveBeenCalled();
		const loggedError = mocks.loggerError.mock.calls[0]?.[0]?.error;
		expect(loggedError).toBeInstanceOf(Error);
		expect((loggedError as Error).message).toContain("--ollama-url");
		expect((loggedError as Error).message).toContain("--vllm-url");
		expect(mocks.loggerError).toHaveBeenCalledWith(
			{ error: expect.any(Error) },
			"Benchmark run crashed",
		);
	});
});
