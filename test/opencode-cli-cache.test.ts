/**
 * Purpose: Regression tests for OpenCode CLI feature-detection caching.
 * Exports: none
 *
 * Invariants:
 * - Failed feature probes do not poison later retries.
 * - Feature detection remains process-local and deterministic in tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const execaMock = vi.hoisted(() => vi.fn());

vi.mock("execa", () => ({
	execa: execaMock,
}));

describe("getOpenCodeRunFeatures", () => {
	beforeEach(() => {
		execaMock.mockReset();
		vi.resetModules();
	});

	it("retries after a transient detection failure instead of caching the rejection", async () => {
		execaMock.mockRejectedValueOnce(new Error("flaky help probe"));

		const { getOpenCodeRunFeatures } = await import(
			"../src/harnesses/opencode-cli.js"
		);

		await expect(getOpenCodeRunFeatures()).rejects.toThrow("flaky help probe");

		execaMock.mockResolvedValueOnce({
			stdout: "--model\n--format\n--dir\n--pure",
			stderr: "",
		});

		await expect(getOpenCodeRunFeatures()).resolves.toEqual({
			supportsModel: true,
			supportsFormat: true,
			supportsDir: true,
			supportsPure: true,
		});
		expect(execaMock).toHaveBeenCalledTimes(2);
	});

	it("shares an in-flight feature probe across concurrent callers", async () => {
		let resolveHelp: (value: { stdout: string; stderr: string }) => void;
		const helpPromise = new Promise<{ stdout: string; stderr: string }>(
			(resolve) => {
				resolveHelp = resolve;
			},
		);
		execaMock.mockReturnValueOnce(helpPromise);

		const { getOpenCodeRunFeatures } = await import(
			"../src/harnesses/opencode-cli.js"
		);

		const first = getOpenCodeRunFeatures();
		const second = getOpenCodeRunFeatures();
		resolveHelp!({
			stdout: "--model\n--format\n--dir\n--pure",
			stderr: "",
		});

		await expect(Promise.all([first, second])).resolves.toEqual([
			{
				supportsModel: true,
				supportsFormat: true,
				supportsDir: true,
				supportsPure: true,
			},
			{
				supportsModel: true,
				supportsFormat: true,
				supportsDir: true,
				supportsPure: true,
			},
		]);
		expect(execaMock).toHaveBeenCalledTimes(1);
	});
});
