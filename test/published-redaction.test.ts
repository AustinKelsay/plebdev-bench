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
});
