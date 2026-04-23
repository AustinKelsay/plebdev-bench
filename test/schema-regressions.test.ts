/**
 * Purpose: Focused schema regression tests for review-driven compatibility fixes.
 * Exports: none
 *
 * Invariants:
 * - Boundary schemas reject incoherent records with targeted errors.
 * - Legacy blank config aliases are normalized before deprecation checks.
 */

import { describe, expect, it } from "vitest";
import {
	BenchConfigSchema,
	MatrixItemResultSchema,
} from "../src/schemas/index.js";

describe("schema regressions", () => {
	it("normalizes blank vllmBaseUrl config values to absent", () => {
		expect(BenchConfigSchema.parse({ vllmBaseUrl: "   " })).not.toHaveProperty(
			"vllmBaseUrl",
		);
	});

	it("rejects partial retry metric payloads", () => {
		expect(() =>
			MatrixItemResultSchema.parse({
				id: "04",
				runtime: "ollama",
				model: "llama3.2:3b",
				harness: "direct",
				test: "smoke",
				passType: "blind",
				status: "completed",
				scoringMetrics: {
					durationMs: 12,
					retryKind: "compile-feedback",
				},
			}),
		).toThrow(/retryKind/);

		const result = MatrixItemResultSchema.parse({
			id: "05",
			runtime: "ollama",
			model: "llama3.2:3b",
			harness: "direct",
			test: "smoke",
			passType: "blind",
			status: "completed",
			scoringMetrics: {
				durationMs: 12,
				retryKind: "compile-feedback",
				retryReason: "compile failed",
				retryAttempted: true,
				retryPromoted: false,
			},
		});

		expect(result.scoringMetrics).toMatchObject({
			retryKind: "compile-feedback",
			retryReason: "compile failed",
			retryAttempted: true,
			retryPromoted: false,
		});

		expect(() =>
			MatrixItemResultSchema.parse({
				id: "06",
				runtime: "ollama",
				model: "llama3.2:3b",
				harness: "direct",
				test: "smoke",
				passType: "blind",
				status: "completed",
				scoringMetrics: {
					durationMs: 12,
					retryAttempted: false,
					retryPromoted: true,
				},
			}),
		).toThrow(/retry metrics must be fully absent/);
	});
});
