/**
 * Purpose: Unit tests for OpenCode process-runner timeout policy.
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
	});
});
