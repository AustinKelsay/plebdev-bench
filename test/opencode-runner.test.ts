/**
 * Purpose: Unit tests for OpenCode process-runner timeout policy.
 * Exports: none
 *
 * Invariants:
 * - Stale-output thresholds are deterministic.
 * - Process-runner policy tests do not require external network access.
 */

import { describe, expect, it } from "vitest";
import { computeOpenCodeStaleOutputTimeoutMs } from "../src/harnesses/opencode-runner.js";

describe("computeOpenCodeStaleOutputTimeoutMs", () => {
	it("uses the minimum stale-output threshold for short requests", () => {
		expect(computeOpenCodeStaleOutputTimeoutMs(60_000)).toBe(120_000);
	});

	it("scales with half the overall timeout up to the maximum", () => {
		expect(computeOpenCodeStaleOutputTimeoutMs(400_000)).toBe(200_000);
		expect(computeOpenCodeStaleOutputTimeoutMs(900_000)).toBe(300_000);
	});

	it("rejects invalid timeout values", () => {
		expect(() => computeOpenCodeStaleOutputTimeoutMs(0)).toThrow(
			"timeoutMs must be a finite positive number",
		);
		expect(() => computeOpenCodeStaleOutputTimeoutMs(-1)).toThrow(
			"timeoutMs must be a finite positive number",
		);
		expect(() => computeOpenCodeStaleOutputTimeoutMs(Number.NaN)).toThrow(
			"timeoutMs must be a finite positive number",
		);
		expect(() =>
			computeOpenCodeStaleOutputTimeoutMs(Number.POSITIVE_INFINITY),
		).toThrow("timeoutMs must be a finite positive number");
		expect(() =>
			computeOpenCodeStaleOutputTimeoutMs(Number.NEGATIVE_INFINITY),
		).toThrow("timeoutMs must be a finite positive number");
	});
});
