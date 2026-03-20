/**
 * Purpose: Verify dynamic timeout calculation honors per-test multipliers.
 */

import { describe, expect, it } from "vitest";
import { calculateTimeout } from "../src/lib/timeout.js";

describe("calculateTimeout", () => {
	it("applies per-test timeout multipliers after harness sizing", () => {
		expect(calculateTimeout(9, "direct", 300_000, "qwen3.5:9b", 1.5)).toBe(
			540_000,
		);
		expect(calculateTimeout(9, "goose", 300_000, "qwen3.5:9b", 1.5)).toBe(
			630_000,
		);
	});

	it("rejects invalid timeout multipliers", () => {
		expect(() =>
			calculateTimeout(9, "direct", 300_000, "qwen3.5:9b", 0),
		).toThrow("timeoutMultiplier must be a finite positive number");
	});

	it("caps multiplied timeouts at the shared maximum", () => {
		expect(calculateTimeout(35, "opencode", 300_000, "qwen3.5:35b", 5)).toBe(
			1_200_000,
		);
	});
});
