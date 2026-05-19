/**
 * Purpose: Behavioral tests for Run Artifact Pair tamper-evidence helpers.
 */

import { describe, expect, it } from "vitest";
import {
	computeRunArtifactPairHash,
	preparePublishedRun,
} from "../src/results/run-artifact-pair.js";
import {
	type RunPlan,
	RunPlanSchema,
	RunProvenanceSchema,
	type RunResult,
	RunResultSchema,
} from "../src/schemas/index.js";

function buildPlan(overrides: Partial<RunPlan> = {}): RunPlan {
	return {
		schemaVersion: "0.5.3",
		runId: "20260518-081500-abc123",
		createdAt: "2026-05-18T15:15:00.000Z",
		config: {
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 120_000,
			passTypes: ["blind"],
		},
		items: [
			{
				id: "01",
				runtime: "ollama",
				model: "qwen3:8b",
				harness: "direct",
				test: "smoke",
				passType: "blind",
				scoringMode: "code-module",
				requiresTools: false,
				requiredHarnessCapabilities: [],
				tags: [],
				timeoutMultiplier: 1,
			},
		],
		summary: {
			totalItems: 1,
			runtimes: 1,
			models: 1,
			harnesses: 1,
			tests: 1,
		},
		...overrides,
	};
}

function buildResult(overrides: Partial<RunResult> = {}): RunResult {
	return {
		schemaVersion: "0.5.3",
		runId: "20260518-081500-abc123",
		startedAt: "2026-05-18T15:15:01.000Z",
		completedAt: "2026-05-18T15:15:08.000Z",
		durationMs: 7000,
		summary: {
			total: 1,
			completed: 1,
			failed: 0,
			pending: 0,
		},
		items: [
			{
				id: "01",
				runtime: "ollama",
				model: "qwen3:8b",
				harness: "direct",
				test: "smoke",
				passType: "blind",
				status: "completed",
				generation: {
					success: true,
					output: "export function add(a: number, b: number) { return a + b; }",
					durationMs: 6500,
				},
				automatedScore: {
					passed: 1,
					failed: 0,
					total: 1,
				},
			},
		],
		...overrides,
	};
}

describe("computeRunArtifactPairHash", () => {
	it("returns the same hash for equivalent Run Artifact Pair content regardless of object key order", () => {
		const plan = buildPlan();
		const result = buildResult();
		const reorderedPlan = {
			items: plan.items,
			config: plan.config,
			createdAt: plan.createdAt,
			summary: plan.summary,
			runId: plan.runId,
			schemaVersion: plan.schemaVersion,
		} as RunPlan;
		const reorderedResult = {
			items: result.items,
			summary: result.summary,
			durationMs: result.durationMs,
			completedAt: result.completedAt,
			startedAt: result.startedAt,
			runId: result.runId,
			schemaVersion: result.schemaVersion,
		} as RunResult;

		expect(computeRunArtifactPairHash({ plan, result })).toEqual(
			computeRunArtifactPairHash({
				plan: reorderedPlan,
				result: reorderedResult,
			}),
		);
	});

	it("changes the pair hash when either artifact changes", () => {
		const baseline = computeRunArtifactPairHash({
			plan: buildPlan(),
			result: buildResult(),
		});

		expect(
			computeRunArtifactPairHash({
				plan: buildPlan({
					config: {
						ollamaBaseUrl: "http://localhost:11434",
						generateTimeoutMs: 240_000,
						passTypes: ["blind"],
					},
				}),
				result: buildResult(),
			}).pairHash,
		).not.toBe(baseline.pairHash);
		expect(
			computeRunArtifactPairHash({
				plan: buildPlan(),
				result: buildResult({ durationMs: 9000 }),
			}).pairHash,
		).not.toBe(baseline.pairHash);
	});

	it("rejects Run Artifact Pairs with mismatched run IDs", () => {
		expect(() =>
			computeRunArtifactPairHash({
				plan: buildPlan(),
				result: buildResult({ runId: "20260518-081500-other" }),
			}),
		).toThrow(/runId mismatch/);
	});

	it("rejects malformed artifact payloads before hashing", () => {
		expect(() =>
			computeRunArtifactPairHash({
				plan: {
					...buildPlan(),
					config: {
						ollamaBaseUrl: "not-a-url",
						generateTimeoutMs: 120_000,
						passTypes: ["blind"],
					},
				},
				result: buildResult(),
			}),
		).toThrow();
	});

	it("does not let embedded tamper evidence recursively change the pair hash", () => {
		const plan = buildPlan({
			provenance: {
				verificationStatus: "self_reported",
				source: "local_cli",
			},
		});
		const result = buildResult({
			provenance: {
				verificationStatus: "self_reported",
				source: "local_cli",
			},
		});
		const tamperEvidence = computeRunArtifactPairHash({ plan, result });

		expect(
			computeRunArtifactPairHash({
				plan: {
					...plan,
					provenance: {
						verificationStatus: "self_reported",
						source: "local_cli",
						tamperEvidence,
					},
				},
				result: {
					...result,
					provenance: {
						verificationStatus: "self_reported",
						source: "local_cli",
						tamperEvidence,
					},
				},
			}),
		).toEqual(tamperEvidence);
	});
});

describe("Run Provenance tamper evidence", () => {
	it("accepts optional Run Artifact Pair tamper evidence without requiring it", () => {
		const tamperEvidence = computeRunArtifactPairHash({
			plan: buildPlan(),
			result: buildResult(),
		});

		expect(RunProvenanceSchema.parse({}).verificationStatus).toBe(
			"self_reported",
		);
		expect(
			RunProvenanceSchema.parse({
				verificationStatus: "self_reported",
				source: "local_cli",
				tamperEvidence,
			}).tamperEvidence,
		).toEqual(tamperEvidence);
	});

	it("preserves verification status separately from tamper evidence on plan and result artifacts", () => {
		const tamperEvidence = computeRunArtifactPairHash({
			plan: buildPlan(),
			result: buildResult(),
		});
		const provenance = {
			verificationStatus: "verified" as const,
			source: "local_cli",
			tamperEvidence,
		};

		expect(
			RunPlanSchema.parse(buildPlan({ provenance })).provenance,
		).toMatchObject({
			verificationStatus: "verified",
			tamperEvidence,
		});
		expect(
			RunResultSchema.parse(buildResult({ provenance })).provenance,
		).toMatchObject({
			verificationStatus: "verified",
			tamperEvidence,
		});
	});
});

describe("preparePublishedRun", () => {
	it("prepares a redacted Published Run without changing verification status", () => {
		const plan = buildPlan({
			provenance: {
				verificationStatus: "verified",
				source: "local_cli",
				submittedBy: "local-operator",
			},
		});
		const result = buildResult({
			provenance: {
				verificationStatus: "verified",
				source: "local_cli",
				submittedBy: "local-operator",
			},
			items: [
				{
					...buildResult().items[0],
					generation: {
						success: true,
						output: "code",
						durationMs: 1000,
						codeFilePath: "/Users/plebdev/private/workspace/out.ts",
						sourcePathToken: "src-token-old",
					},
				},
			],
		});

		const published = preparePublishedRun({
			plan,
			result,
			redaction: {
				pathTokens: {
					"/Users/plebdev/private/workspace/out.ts": "published-path-1",
				},
			},
		});

		expect(published.plan.runId).toBe(plan.runId);
		expect(published.result.runId).toBe(result.runId);
		expect(published.tamperEvidence).toEqual(
			published.result.provenance?.tamperEvidence,
		);
		expect(published.plan.provenance).toMatchObject({
			verificationStatus: "verified",
			tamperEvidence: published.tamperEvidence,
		});
		expect(published.result.provenance).toMatchObject({
			verificationStatus: "verified",
			tamperEvidence: published.tamperEvidence,
		});
		expect(published.result.items[0]?.generation?.codeFilePath).toBeUndefined();
		expect(published.result.items[0]?.generation?.sourcePathToken).toBe(
			"published-path-1",
		);
	});

	it("computes tamper evidence from the finalized published provenance", () => {
		const published = preparePublishedRun({
			plan: buildPlan(),
			result: buildResult(),
			redaction: { pathTokens: {} },
		});

		expect(
			computeRunArtifactPairHash({
				plan: published.plan,
				result: published.result,
			}),
		).toEqual(published.tamperEvidence);
	});

	it("rejects publication for mismatched Run Artifact Pairs", () => {
		expect(() =>
			preparePublishedRun({
				plan: buildPlan(),
				result: buildResult({ runId: "20260518-081500-other" }),
				redaction: { pathTokens: {} },
			}),
		).toThrow(/runId mismatch/);
	});

	it("rejects publication when a local code file path lacks a redaction token", () => {
		expect(() =>
			preparePublishedRun({
				plan: buildPlan(),
				result: buildResult({
					items: [
						{
							...buildResult().items[0],
							generation: {
								success: true,
								output: "code",
								durationMs: 1000,
								codeFilePath: "/Users/plebdev/private/out.ts",
							},
						},
					],
				}),
				redaction: { pathTokens: {} },
			}),
		).toThrow(/Missing redaction token/);
	});
});
