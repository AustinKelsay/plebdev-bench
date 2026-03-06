/**
 * Purpose: Validate dashboard index v2 and aggregate artifact generation.
 * Exports: none
 *
 * Invariants:
 * - Temporary project roots include all benchmark-defining assets required for checkpointing
 * - Published result fixtures remain deterministic and isolated per test
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDashboardIndexArtifacts } from "../apps/dashboard/scripts/build-index.js";
import { computeBenchmarkCheckpoint } from "../src/lib/benchmark-checkpoint.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

const tempRoots: string[] = [];
const REQUIRED_LIB_ASSETS = [
	"benchmark-checkpoint.ts",
	"scorer.ts",
	"scorer-core.ts",
	"scorer-worker.ts",
	"scoring-spec.ts",
	"code-extractor.ts",
	"stdout-suppressor.ts",
	"test-catalog.ts",
	"timeout.ts",
	"tool-smoke.ts",
	"failure-classifier.ts",
	"model-aliases.ts",
	"ollama-client.ts",
	"openai-compat-client.ts",
	"openrouter-client.ts",
] as const;

const REQUIRED_SOURCE_DIR_FIXTURES = [
	["src/harnesses", "direct-adapter.ts", "export const directAdapter = 1;\n"],
	["src/runtimes", "ollama-runtime.ts", "export const ollamaRuntime = 1;\n"],
	["src/runner", "index.ts", "export const runnerIndex = 1;\n"],
] as const;

/**
 * Creates a temporary benchmark project root with minimal benchmark assets.
 *
 * @returns Absolute temporary root path
 */
function createProjectRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "plebdev-bench-index-"));
	tempRoots.push(root);

	const testRoot = path.join(root, "src", "tests", "smoke");
	fs.mkdirSync(testRoot, { recursive: true });
	fs.writeFileSync(
		path.join(testRoot, "test.meta.json"),
		JSON.stringify({ schemaVersion: 1, category: "coding" }, null, 2),
	);
	fs.writeFileSync(path.join(testRoot, "prompt.blind.md"), "blind");
	fs.writeFileSync(path.join(testRoot, "prompt.informed.md"), "informed");
	fs.writeFileSync(path.join(testRoot, "rubric.md"), "rubric");
	fs.writeFileSync(
		path.join(testRoot, "scoring.spec.ts"),
		"export const spec = {};",
	);

	const libRoot = path.join(root, "src", "lib");
	fs.mkdirSync(libRoot, { recursive: true });
	for (const filename of REQUIRED_LIB_ASSETS) {
		const exportName = filename.replaceAll(/[^a-zA-Z0-9]+/g, "_");
		fs.writeFileSync(
			path.join(libRoot, filename),
			`export const ${exportName} = ${JSON.stringify(filename)};\n`,
		);
	}

	for (const [dirPath, filename, content] of REQUIRED_SOURCE_DIR_FIXTURES) {
		const absoluteDir = path.join(root, dirPath);
		fs.mkdirSync(absoluteDir, { recursive: true });
		fs.writeFileSync(path.join(absoluteDir, filename), content);
	}

	return root;
}

/**
 * Writes a run directory with plan/run JSON files.
 *
 * @param resultsDir - Results root path
 * @param runId - Run identifier
 * @param runPayload - JSON payload for run.json
 * @param planPayload - JSON payload for plan.json
 */
function writeRunDir(
	resultsDir: string,
	runId: string,
	runPayload: unknown,
	planPayload: unknown,
): void {
	const runDir = path.join(resultsDir, runId);
	fs.mkdirSync(runDir, { recursive: true });
	fs.writeFileSync(
		path.join(runDir, "run.json"),
		JSON.stringify(runPayload, null, 2),
	);
	fs.writeFileSync(
		path.join(runDir, "plan.json"),
		JSON.stringify(planPayload, null, 2),
	);
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("buildDashboardIndexArtifacts", () => {
	it("writes v2 index and latest aggregate artifacts", async () => {
		const projectRoot = createProjectRoot();
		const resultsDir = path.join(projectRoot, "published-results");
		fs.mkdirSync(resultsDir, { recursive: true });

		const checkpoint = computeBenchmarkCheckpoint(projectRoot);

		writeRunDir(
			resultsDir,
			"run-latest",
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-latest",
				machine: {
					profileId: "machine-a",
					label: "Machine A",
					hardware: {
						platform: "darwin",
						arch: "arm64",
						osRelease: "24.3.0",
						cpuModel: "Apple M4 Pro",
						logicalCores: 14,
						totalMemoryBytes: 68_719_476_736,
					},
				},
				benchmarkCheckpoint: checkpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				startedAt: "2026-03-04T10:00:00.000Z",
				completedAt: "2026-03-04T10:01:00.000Z",
				durationMs: 60_000,
				summary: { total: 1, completed: 1, failed: 0, pending: 0 },
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "llama3.2:3b",
						harness: "direct",
						test: "smoke",
						passType: "blind",
						status: "completed",
						startedAt: "2026-03-04T10:00:00.000Z",
						completedAt: "2026-03-04T10:01:00.000Z",
						generation: { success: true, output: "code", durationMs: 1000 },
						automatedScore: { passed: 6, failed: 0, total: 6 },
					},
				],
			},
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-latest",
				createdAt: "2026-03-04T10:00:00.000Z",
				runtimeEnvironment: { platform: "darwin", bunVersion: "1.3.3" },
				machine: {
					profileId: "machine-a",
					label: "Machine A",
					hardware: {
						platform: "darwin",
						arch: "arm64",
						osRelease: "24.3.0",
						cpuModel: "Apple M4 Pro",
						logicalCores: 14,
						totalMemoryBytes: 68_719_476_736,
					},
				},
				benchmarkCheckpoint: checkpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				config: {
					ollamaBaseUrl: "http://localhost:11434",
					vllmBaseUrl: "http://localhost:8000",
					generateTimeoutMs: 120_000,
					passTypes: ["blind"],
				},
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "llama3.2:3b",
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
			},
		);

		writeRunDir(
			resultsDir,
			"run-legacy",
			{
				schemaVersion: "0.2.2",
				runId: "run-legacy",
				startedAt: "2026-03-03T10:00:00.000Z",
				completedAt: "2026-03-03T10:01:00.000Z",
				durationMs: 60_000,
				summary: { total: 1, completed: 1, failed: 0, pending: 0 },
				items: [],
			},
			{
				schemaVersion: "0.2.2",
				runId: "run-legacy",
				createdAt: "2026-03-03T10:00:00.000Z",
				environment: { platform: "darwin", bunVersion: "1.3.3" },
				config: {
					ollamaBaseUrl: "http://localhost:11434",
					vllmBaseUrl: "http://localhost:8000",
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
			},
		);

		const output = await buildDashboardIndexArtifacts({
			resultsDir,
			projectRoot,
		});
		expect(output.index.schemaVersion).toBe(2);
		expect(output.index.latestCheckpointId).toBe(checkpoint.checkpointId);
		expect(output.index.runs).toHaveLength(2);
		expect(
			output.index.runs.find(
				(run: { runId: string; isLegacy?: boolean }) =>
					run.runId === "run-legacy",
			)?.isLegacy,
		).toBe(true);

		const latestAggregatePath = path.join(
			resultsDir,
			"aggregates",
			"latest.json",
		);
		expect(fs.existsSync(latestAggregatePath)).toBe(true);
		const latestAggregate = JSON.parse(
			fs.readFileSync(latestAggregatePath, "utf-8"),
		) as {
			checkpointId: string;
			summary: { runsMatched: number };
			items: unknown[];
		};
		expect(latestAggregate.checkpointId).toBe(checkpoint.checkpointId);
		expect(latestAggregate.summary.runsMatched).toBe(1);
		expect(latestAggregate.items).toHaveLength(1);
	});
});
