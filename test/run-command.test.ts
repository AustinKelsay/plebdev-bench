/**
 * Purpose: Regression tests for `bench run` CLI option normalization.
 * Exports: none
 *
 * Invariants:
 * - Runner side effects are mocked.
 * - Deprecated URL aliases must not silently conflict with canonical flags.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MIN_FREE_DISK_BYTES } from "../src/lib/disk-space.js";

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

function resetRunCommandOptions(): void {
	for (const option of runCommand.options) {
		runCommand.setOptionValueWithSource(
			option.attributeName(),
			option.defaultValue,
			"default",
		);
	}
}

describe("runCommand", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		resetRunCommandOptions();
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
			{
				error: expect.any(Error),
				errorMessage: expect.stringContaining("--ollama-url"),
			},
			"Benchmark run crashed",
		);
	});

	it("documents Hermes harness and turn-limit options in help text", () => {
		const helpText = runCommand.helpInformation();

		expect(helpText).toContain("direct, goose, hermes, opencode");
		expect(helpText).toContain("--min-free-disk-gb");
		expect(helpText).toContain("--hermes-max-turns");
		expect(helpText).toContain("--hermes-retry-max-turns");
		expect(helpText).toContain("--hermes-workspace-max-turns");
		expect(helpText).toContain("--hermes-workspace-retry-max-turns");
	});

	it("passes custom disk threshold to the runner in bytes", async () => {
		await runCommand.parseAsync(["--min-free-disk-gb", "1.5"], {
			from: "user",
		});

		expect(mocks.runBenchmark).toHaveBeenCalledWith(
			expect.objectContaining({
				minFreeDiskBytes: 1.5 * 1024 ** 3,
			}),
		);
	});

	it("uses the official-run default disk threshold", async () => {
		await runCommand.parseAsync([], { from: "user" });

		expect(mocks.runBenchmark).toHaveBeenCalledWith(
			expect.objectContaining({
				minFreeDiskBytes: DEFAULT_MIN_FREE_DISK_BYTES,
			}),
		);
	});
});
