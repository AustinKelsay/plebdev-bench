/**
 * Purpose: Unit tests for benchmark free-space guardrails.
 * Exports: none
 *
 * Invariants:
 * - Low disk space is a startup/checkpoint crash, not a late artifact surprise.
 * - A zero threshold remains available for narrow local smoke tests.
 */

import * as os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_MIN_FREE_DISK_BYTES,
	assertFreeDiskSpace,
	formatByteCount,
	getBenchmarkWriteRoots,
} from "../src/lib/disk-space.js";

describe("formatByteCount", () => {
	it("formats binary byte counts", () => {
		expect(formatByteCount(0)).toBe("0 B");
		expect(formatByteCount(1024)).toBe("1.0 KiB");
		expect(formatByteCount(20 * 1024 ** 3)).toBe("20.0 GiB");
	});
});

describe("getBenchmarkWriteRoots", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("includes result, temp, and OpenCode data roots", () => {
		const xdgDataHome = "/tmp/plebdev-bench-xdg-data";
		vi.stubEnv("XDG_DATA_HOME", xdgDataHome);
		const roots = getBenchmarkWriteRoots("results");

		expect(roots).toEqual(
			expect.arrayContaining([expect.stringContaining("results")]),
		);
		expect(roots).toContain(os.tmpdir());
		expect(roots).toContain(xdgDataHome);
		expect(new Set(roots).size).toBe(roots.length);
	});
});

describe("assertFreeDiskSpace", () => {
	it("allows zero threshold for explicit local smoke runs", async () => {
		await expect(
			assertFreeDiskSpace({
				paths: [os.tmpdir()],
				minFreeBytes: 0,
				action: "test run",
			}),
		).resolves.toBeUndefined();
	});

	it("throws a clear error when available space is below the threshold", async () => {
		await expect(
			assertFreeDiskSpace({
				paths: [os.tmpdir()],
				minFreeBytes: Number.MAX_SAFE_INTEGER,
				action: "test run",
			}),
		).rejects.toThrow(/Insufficient free disk space for test run/);
	});

	it("exports the official-run default threshold", () => {
		expect(DEFAULT_MIN_FREE_DISK_BYTES).toBe(20 * 1024 ** 3);
	});
});
