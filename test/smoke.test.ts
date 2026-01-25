/**
 * Purpose: Deterministic smoke test to verify tooling setup.
 * This test does not require network or external dependencies.
 */

import { describe, expect, it } from "vitest";

describe("tooling smoke test", () => {
	it("should run a basic assertion", () => {
		expect(1 + 1).toBe(2);
	});

	it("should handle async operations", async () => {
		const result = await Promise.resolve("hello");
		expect(result).toBe("hello");
	});

	it("should work with objects", () => {
		const obj = { name: "plebdev-bench", version: "0.1.0" };
		expect(obj).toMatchObject({ name: "plebdev-bench" });
	});
});
