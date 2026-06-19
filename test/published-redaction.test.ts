/**
 * Purpose: Validate Published Redaction boundaries for dashboard publication.
 * Exports: none
 *
 * Invariants:
 * - Published Redaction creates a separate representation.
 * - Partial Run Results cannot become Published Runs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDashboardIndexArtifacts } from "../apps/dashboard/scripts/build-index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

const tempRoots: string[] = [];

function createTempRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "plebdev-publish-"));
	tempRoots.push(root);
	return root;
}

function writeJson(filePath: string, payload: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("Published Redaction", () => {
	it("skips plan-only result directories during publication scans", async () => {
		const root = createTempRoot();
		const sourceResultsDir = path.join(root, "results");
		const outputResultsDir = path.join(root, "published-results");
		const completeRunDir = path.join(sourceResultsDir, "run-complete");

		writeJson(path.join(sourceResultsDir, "plan-only", "plan.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "plan-only",
			createdAt: "2026-05-19T10:00:00.000Z",
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				passTypes: ["blind"],
			},
			items: [],
			summary: {
				totalItems: 0,
				runtimes: 0,
				models: 0,
				harnesses: 0,
				tests: 0,
			},
		});
		writeJson(path.join(completeRunDir, "run.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-complete",
			startedAt: "2026-05-19T10:00:00.000Z",
			completedAt: "2026-05-19T10:01:00.000Z",
			durationMs: 60_000,
			summary: { total: 0, completed: 0, failed: 0, pending: 0 },
			items: [],
		});

		const output = await buildDashboardIndexArtifacts({
			sourceResultsDir,
			outputResultsDir,
			projectRoot: root,
			latestCheckpointId: "chk_test",
		});

		expect(output.index.runs.map((run) => run.runId)).toEqual(["run-complete"]);
		expect(fs.existsSync(path.join(outputResultsDir, "plan-only"))).toBe(false);
	});

	it("rejects partial Run Results before writing published artifacts", async () => {
		const root = createTempRoot();
		const sourceResultsDir = path.join(root, "results");
		const outputResultsDir = path.join(root, "published-results");
		const runDir = path.join(sourceResultsDir, "run-partial");
		const runJsonPath = path.join(runDir, "run.json");

		writeJson(runJsonPath, {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-partial",
			startedAt: "2026-05-19T10:00:00.000Z",
			completedAt: "2026-05-19T10:01:00.000Z",
			durationMs: 60_000,
			summary: { total: 1, completed: 0, failed: 0, pending: 1 },
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3:8b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
					status: "pending",
				},
			],
		});
		writeJson(path.join(runDir, "plan.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-partial",
			createdAt: "2026-05-19T10:00:00.000Z",
			runtimeEnvironment: { platform: "darwin", bunVersion: "1.3.3" },
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
				},
			],
			summary: {
				totalItems: 1,
				runtimes: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
			},
		});
		const originalRunJson = fs.readFileSync(runJsonPath, "utf-8");

		await expect(
			buildDashboardIndexArtifacts({
				sourceResultsDir,
				outputResultsDir,
				projectRoot: root,
				latestCheckpointId: "chk_test",
			}),
		).rejects.toThrow("Partial Run Result cannot be published");

		expect(fs.readFileSync(runJsonPath, "utf-8")).toBe(originalRunJson);
		expect(fs.existsSync(outputResultsDir)).toBe(false);
	});

	it("rejects final-looking Run Results with mismatched summary counters", async () => {
		const root = createTempRoot();
		const sourceResultsDir = path.join(root, "results");
		const outputResultsDir = path.join(root, "published-results");
		const runDir = path.join(sourceResultsDir, "run-inconsistent");

		writeJson(path.join(runDir, "run.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-inconsistent",
			startedAt: "2026-05-19T10:00:00.000Z",
			completedAt: "2026-05-19T10:01:00.000Z",
			durationMs: 60_000,
			summary: { total: 1, completed: 1, failed: 0, pending: 0 },
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "qwen3:8b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
					status: "failed",
				},
			],
		});
		writeJson(path.join(runDir, "plan.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-inconsistent",
			createdAt: "2026-05-19T10:00:00.000Z",
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				passTypes: ["blind"],
			},
			items: [],
			summary: {
				totalItems: 0,
				runtimes: 0,
				models: 0,
				harnesses: 0,
				tests: 0,
			},
		});

		await expect(
			buildDashboardIndexArtifacts({
				sourceResultsDir,
				outputResultsDir,
				projectRoot: root,
				latestCheckpointId: "chk_test",
			}),
		).rejects.toThrow("run-inconsistent");
		expect(fs.existsSync(outputResultsDir)).toBe(false);
	});

	it("redacts host paths and internal tool transcripts from published runs and aggregates", async () => {
		const root = createTempRoot();
		const sourceResultsDir = path.join(root, "results");
		const outputResultsDir = path.join(root, "published-results");
		const runDir = path.join(sourceResultsDir, "run-redaction");
		const checkpoint = {
			checkpointId: "chk_redaction",
			algorithm: "sha256v1",
			manifestHash: "abc123",
			assetCount: 1,
			computedAt: "2026-06-19T10:00:00.000Z",
		};
		const internalTranscript = [
			"Command failed with exit code 1: hermes chat",
			"Workspace root for orientation only: /private/var/folders/example/T/plebdev-bench-hermes-workspace-abc",
			"",
			"session_id: 20260619_085141_16ce50",
			"",
			"  ┊ review diff",
			"API call failed: error parsing tool call: raw='/Users/example/private/out.ts'",
		].join("\n");

		writeJson(path.join(runDir, "run.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-redaction",
			benchmarkCheckpoint: checkpoint,
			startedAt: "2026-06-19T10:00:00.000Z",
			completedAt: "2026-06-19T10:01:00.000Z",
			durationMs: 60_000,
			summary: { total: 1, completed: 0, failed: 1, pending: 0 },
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "gpt-oss:20b",
					harness: "hermes",
					test: "workspace-reorg",
					passType: "blind",
					status: "failed",
					generation: {
						success: false,
						output:
							"The workspace root seems /private/.../plebdev-bench-file-locator-cWlAzp",
						error: internalTranscript,
						durationMs: 1000,
						codeFilePath: "/Users/example/private/out.ts",
					},
					generationFailure: {
						type: "harness_error",
						message: internalTranscript,
					},
				},
			],
		});
		writeJson(path.join(runDir, "plan.json"), {
			schemaVersion: SCHEMA_VERSION,
			runId: "run-redaction",
			createdAt: "2026-06-19T10:00:00.000Z",
			benchmarkCheckpoint: checkpoint,
			config: {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 120_000,
				passTypes: ["blind"],
			},
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "gpt-oss:20b",
					harness: "hermes",
					test: "workspace-reorg",
					passType: "blind",
				},
			],
			summary: {
				totalItems: 1,
				runtimes: 1,
				models: 1,
				harnesses: 1,
				tests: 1,
			},
		});

		await buildDashboardIndexArtifacts({
			sourceResultsDir,
			outputResultsDir,
			projectRoot: root,
			latestCheckpointId: checkpoint.checkpointId,
		});

		const publishedRunText = fs.readFileSync(
			path.join(outputResultsDir, "run-redaction", "run.json"),
			"utf-8",
		);
		const latestAggregateText = fs.readFileSync(
			path.join(outputResultsDir, "aggregates", "latest.json"),
			"utf-8",
		);
		const combinedPublishedText = `${publishedRunText}\n${latestAggregateText}`;

		expect(combinedPublishedText).toContain(
			"[redacted internal tool transcript]",
		);
		expect(combinedPublishedText).not.toContain("/Users/");
		expect(combinedPublishedText).not.toContain("/private/");
		expect(combinedPublishedText).not.toContain("/var/folders");
		expect(combinedPublishedText).not.toContain("session_id:");
		expect(combinedPublishedText).not.toContain("raw=");
		expect(combinedPublishedText).not.toContain("review diff");

		const publishedRun = JSON.parse(publishedRunText) as {
			items: Array<{
				generation?: { codeFilePath?: string; sourcePathToken?: string };
			}>;
		};
		expect(publishedRun.items[0]?.generation?.codeFilePath).toBeUndefined();
		expect(publishedRun.items[0]?.generation?.sourcePathToken).toBe(
			"[path:out.ts]",
		);
	});
});
