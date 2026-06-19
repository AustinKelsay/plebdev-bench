/**
 * Purpose: Focused schema regression tests for review-driven compatibility fixes.
 * Exports: none
 *
 * Invariants:
 * - Boundary schemas reject incoherent records with targeted errors.
 * - Deprecated config aliases emit targeted errors even when blank.
 */

import { describe, expect, it } from "vitest";
import { parseKnownRunPayload } from "../src/lib/machine-profile/legacy.js";
import {
	BenchConfigSchema,
	MatrixItemResultSchema,
} from "../src/schemas/index.js";

describe("schema regressions", () => {
	it("rejects blank deprecated vllmBaseUrl config values", () => {
		const result = BenchConfigSchema.safeParse({ vllmBaseUrl: "   " });

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("expected deprecated vllmBaseUrl to fail");
		}
		expect(result.error.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ["vllmBaseUrl"],
					message: expect.stringContaining(
						'Bench config no longer supports "vllmBaseUrl"',
					),
				}),
			]),
		);
	});

	it("rejects partial retry metric payloads", () => {
		const partialRetryResult = MatrixItemResultSchema.safeParse({
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
		});
		expect(partialRetryResult.success).toBe(false);
		if (partialRetryResult.success) {
			throw new Error("expected partial retry metrics to fail");
		}
		expect(partialRetryResult.error.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ["scoringMetrics", "retryKind"],
					message: expect.stringContaining(
						"retry metrics must be fully absent",
					),
				}),
			]),
		);

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
				retryGenerationDurationMs: 5,
			},
		});

		expect(result.scoringMetrics).toMatchObject({
			retryKind: "compile-feedback",
			retryReason: "compile failed",
			retryAttempted: true,
			retryPromoted: false,
		});

		const inconsistentRetryResult = MatrixItemResultSchema.safeParse({
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
		});
		expect(inconsistentRetryResult.success).toBe(false);
		if (inconsistentRetryResult.success) {
			throw new Error("expected inconsistent retry metrics to fail");
		}
		expect(inconsistentRetryResult.error.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ["scoringMetrics", "retryKind"],
					message: expect.stringContaining(
						"when retryAttempted is false the other retry fields must be absent",
					),
				}),
			]),
		);
	});

	it("migrates legacy retry generation metrics into a coherent retry record", () => {
		const result = parseKnownRunPayload({
			schemaVersion: "0.5.0",
			runId: "legacy-retry-run",
			startedAt: "2026-03-25T15:00:00.000Z",
			completedAt: "2026-03-25T15:01:00.000Z",
			durationMs: 60_000,
			summary: { total: 1, completed: 1, failed: 0, pending: 0 },
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3.6:35b",
					harness: "goose",
					test: "smoke",
					passType: "blind",
					status: "completed",
					generation: {
						success: true,
						output:
							"export function add(a: number, b: number) { return a + b; }",
						durationMs: 42,
					},
					automatedScore: { passed: 6, failed: 0, total: 6 },
					scoringMetrics: {
						durationMs: 100,
						scoringDurationMs: 58,
						retryGenerationDurationMs: 42,
					},
				},
			],
		});

		expect(result.items[0]?.scoringMetrics).toMatchObject({
			retryAttempted: true,
			retryKind: "compile-feedback",
			retryReason: "legacy artifact recorded retryGenerationDurationMs",
			retryPromoted: false,
			retryGenerationDurationMs: 42,
		});
	});
});
