/**
 * Purpose: Regression tests for model-alias schema trimming and blank rejection.
 * Exports: none
 *
 * Invariants:
 * - Alias targets are trimmed before persistence.
 * - Blank alias targets are rejected.
 */

import { describe, expect, it } from "vitest";
import { ModelAliasEntrySchema } from "../src/schemas/model-alias.schema.js";

describe("ModelAliasEntrySchema", () => {
	it("trims alias targets", () => {
		expect(
			ModelAliasEntrySchema.parse({
				ollama: "  qwen3:8b  ",
			}),
		).toEqual({
			ollama: "qwen3:8b",
		});
	});

	it("rejects blank alias targets", () => {
		expect(() =>
			ModelAliasEntrySchema.parse({
				ollama: "   ",
			}),
		).toThrow("alias target must be a non-empty string");
	});
});
