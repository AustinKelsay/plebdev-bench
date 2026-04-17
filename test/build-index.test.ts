/**
 * Purpose: Validate dashboard index v3 and aggregate artifact generation.
 * Exports: none
 *
 * Invariants:
 * - Temporary project roots include all benchmark-defining assets required for checkpointing
 * - Published result fixtures remain deterministic and isolated per test
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildDashboardIndexArtifacts,
	resolveResultsDir,
} from "../apps/dashboard/scripts/build-index.js";
import { computeBenchmarkCheckpoint } from "../src/lib/benchmark-checkpoint.js";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "../src/lib/machine-profile/normalization.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

const tempRoots: string[] = [];
const REQUIRED_LIB_ASSETS = [
	"benchmark-checkpoint.ts",
	"scorer.ts",
	"scorer-core.ts",
	"code-module-scorer.ts",
	"scorer-worker.ts",
	"scoring-spec.ts",
	"workspace-scorer.ts",
	"workspace-manifest.ts",
	"test-workspace.ts",
	"signal-assessment.ts",
	"code-extractor.ts",
	"stdout-suppressor.ts",
	"test-catalog.ts",
	"timeout.ts",
	"tool-smoke.ts",
	"failure-classifier.ts",
	"model-aliases.ts",
	"ollama-client.ts",
	"openrouter-client.ts",
] as const;

const REQUIRED_SOURCE_DIR_FIXTURES = [
	["src/harnesses", "direct-adapter.ts", "export const directAdapter = 1;\n"],
	["src/runtimes", "ollama-runtime.ts", "export const ollamaRuntime = 1;\n"],
	["src/runner", "index.ts", "export const runnerIndex = 1;\n"],
] as const;

const TEST_HARDWARE = {
	platform: "darwin",
	arch: "arm64",
	osRelease: "24.3.0",
	cpuModelRaw: "Apple M4 Pro",
	logicalCores: 14,
	totalMemoryBytes: 68_719_476_736,
	accelerators: [
		{
			vendor: "Apple",
			modelRaw: "Apple M4 Pro GPU",
			kind: "integrated" as const,
			backend: "metal",
		},
	],
	acceleratorDetection: {
		status: "detected" as const,
	},
};
const TEST_NORMALIZED_PROFILE = normalizeMachineProfile(TEST_HARDWARE);
const TEST_PROFILE_KEY = buildMachineProfileKey(TEST_NORMALIZED_PROFILE);
const TEST_PROFILE_LABEL = buildMachineProfileLabel(
	TEST_HARDWARE,
	TEST_NORMALIZED_PROFILE,
);
const SCRUBBED_MACHINE_A = `machine-${createHash("sha256").update("machine-a").digest("hex").slice(0, 12)}`;

function buildMachine(instanceId: string) {
	return {
		instanceId,
		instanceIdSource: "config" as const,
		displayLabel: "Machine A",
		profileKey: TEST_PROFILE_KEY,
		profileLabel: TEST_PROFILE_LABEL,
		normalizedProfile: TEST_NORMALIZED_PROFILE,
		observedHardware: TEST_HARDWARE,
	};
}

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

type LatestAggregateFixture = {
	checkpointId: string;
	summary: { runsMatched: number };
	items: Array<{
		machineProfileKey?: string;
		machineProfileId?: string;
		machineInstanceId?: string;
		machineDisplayLabel?: string;
		machineLabel?: string;
		generation?: {
			codeFilePath?: string;
			sourcePathToken?: string;
			output?: string;
		};
		scoringFailure?: {
			message?: string;
		};
	}>;
};

describe("buildDashboardIndexArtifacts", () => {
	it("rejects overlapping source and output directories before mutating files", async () => {
		const projectRoot = createProjectRoot();
		const sourceResultsDir = path.join(projectRoot, "results");
		const outputResultsDir = path.join(sourceResultsDir, "published-results");
		fs.mkdirSync(outputResultsDir, { recursive: true });

		await expect(
			buildDashboardIndexArtifacts({
				sourceResultsDir,
				outputResultsDir,
				projectRoot,
			}),
		).rejects.toThrow(/must not overlap/);
	});

	it("writes v3 index and latest aggregate artifacts", async () => {
		const projectRoot = createProjectRoot();
		const sourceResultsDir = path.join(projectRoot, "results");
		const outputResultsDir = path.join(projectRoot, "published-results");
		fs.mkdirSync(sourceResultsDir, { recursive: true });
		fs.mkdirSync(outputResultsDir, { recursive: true });

		const checkpoint = computeBenchmarkCheckpoint(projectRoot);

		writeRunDir(
			sourceResultsDir,
			"run-latest",
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-latest",
				machine: buildMachine("machine-a"),
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
						generation: {
							success: true,
							output:
								"Wrote /Users/example/.local/share/opencode/tool-output/run-1/solution.ts",
							error: '{"type":"step_start","sessionID":"abc123"}',
							durationMs: 1000,
							codeFilePath:
								"/Users/example/.local/share/opencode/tool-output/run-1/solution.ts",
						},
						generationFailure: {
							type: "unknown",
							message: "THOUGHT: investigating tool transcript",
						},
						automatedScore: { passed: 6, failed: 0, total: 6 },
						scoringFailure: {
							type: "test_execution",
							message:
								'Failed to read "/private/var/folders/abc/reports/output.json" plus {"type":"tool_use"}',
						},
						frontierEvalFailure: {
							type: "parse_error",
							message: '"type":"step_finish"',
						},
					},
				],
			},
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-latest",
				createdAt: "2026-03-04T10:00:00.000Z",
				runtimeEnvironment: { platform: "darwin", bunVersion: "1.3.3" },
				machine: buildMachine("machine-a"),
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
			sourceResultsDir,
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
			sourceResultsDir,
			outputResultsDir,
			projectRoot,
		});
		expect(output.index.schemaVersion).toBe(3);
		expect(output.index.latestCheckpointId).toBe(checkpoint.checkpointId);
		expect(output.index.runs).toHaveLength(2);
		expect(
			output.index.runs.find(
				(run: { runId: string; isLegacy?: boolean }) =>
					run.runId === "run-legacy",
			)?.isLegacy,
		).toBe(true);

		const latestAggregatePath = path.join(
			outputResultsDir,
			"aggregates",
			"latest.json",
		);
		expect(fs.existsSync(latestAggregatePath)).toBe(true);
		const latestAggregate = JSON.parse(
			fs.readFileSync(latestAggregatePath, "utf-8"),
		) as LatestAggregateFixture;
		expect(latestAggregate.checkpointId).toBe(checkpoint.checkpointId);
		expect(latestAggregate.summary.runsMatched).toBe(1);
		expect(latestAggregate.items).toHaveLength(1);
		expect(latestAggregate.items[0]?.generation?.codeFilePath).toBeUndefined();
		expect(latestAggregate.items[0]?.generation?.sourcePathToken).toBe(
			"[path:solution.ts]",
		);
		expect(latestAggregate.items[0]?.generation?.output).toContain(
			"[path:solution.ts]",
		);
		expect(latestAggregate.items[0]?.generation?.output).not.toContain(
			"/Users/example",
		);
		expect(latestAggregate.items[0]?.scoringFailure?.message).toBe(
			"[redacted internal tool transcript]",
		);
		expect(latestAggregate.items[0]?.machineProfileKey).toBe(TEST_PROFILE_KEY);
		expect(latestAggregate.items[0]?.machineProfileId).toBe(TEST_PROFILE_KEY);
		expect(latestAggregate.items[0]?.machineInstanceId).toBe(
			SCRUBBED_MACHINE_A,
		);
		expect(output.index.runs[0]?.runId).toBe("run-latest");
		expect(output.index.runs[0]?.machineProfileKey).toBe(TEST_PROFILE_KEY);
		expect(output.index.runs[0]?.machineProfileId).toBe(TEST_PROFILE_KEY);
		expect(output.index.runs[0]?.machineInstanceId).toBe(SCRUBBED_MACHINE_A);
		expect(output.index.runs[0]?.machineDisplayLabel).toBe("Machine A");
		expect(output.index.runs[0]?.machineLabel).toBe("Machine A");
		const publishedRunPath = path.join(
			outputResultsDir,
			"run-latest",
			"run.json",
		);
		expect(fs.existsSync(publishedRunPath)).toBe(true);
		const publishedRun = JSON.parse(
			fs.readFileSync(publishedRunPath, "utf-8"),
		) as {
			machine?: {
				instanceId?: string;
			};
			items: Array<{
				generation?: {
					codeFilePath?: string;
					sourcePathToken?: string;
					output?: string;
					error?: string;
				};
				generationFailure?: { message?: string };
				scoringFailure?: { message?: string };
				frontierEvalFailure?: { message?: string };
			}>;
		};
		expect(publishedRun.machine?.instanceId).toBe(SCRUBBED_MACHINE_A);
		expect(publishedRun.items[0]?.generation?.codeFilePath).toBeUndefined();
		expect(publishedRun.items[0]?.generation?.sourcePathToken).toBe(
			"[path:solution.ts]",
		);
		expect(publishedRun.items[0]?.generation?.output).toContain(
			"[path:solution.ts]",
		);
		expect(publishedRun.items[0]?.generation?.error).toBe(
			"[redacted internal tool transcript]",
		);
		expect(publishedRun.items[0]?.generationFailure?.message).toBe(
			"[redacted internal tool transcript]",
		);
		expect(publishedRun.items[0]?.scoringFailure?.message).toBe(
			"[redacted internal tool transcript]",
		);
		expect(publishedRun.items[0]?.frontierEvalFailure?.message).toBe(
			"[redacted internal tool transcript]",
		);
		expect(publishedRun.items[0]?.generation?.output).not.toContain(
			"/Users/example",
		);
		expect(publishedRun.items[0]?.scoringFailure?.message).not.toContain(
			"/private/var/folders",
		);
		expect(publishedRun.items[0]?.scoringFailure?.message).not.toContain(
			"C:/Users/example",
		);
		expect(publishedRun.items[0]?.scoringFailure?.message).not.toContain(
			"/home/example",
		);
		expect(publishedRun.items[0]?.scoringFailure?.message).not.toContain(
			"/root/secret",
		);
		const publishedPlanPath = path.join(
			outputResultsDir,
			"run-latest",
			"plan.json",
		);
		expect(fs.existsSync(publishedPlanPath)).toBe(true);
		const publishedPlan = JSON.parse(
			fs.readFileSync(publishedPlanPath, "utf-8"),
		) as {
			machine?: {
				displayLabel?: string;
				profileLabel?: string;
			};
		};
		expect(publishedPlan.machine?.displayLabel).toBeUndefined();
		expect(publishedPlan.machine?.profileLabel).toBe(TEST_PROFILE_LABEL);
	});

	it("falls back latestCheckpointId to the newest published checkpoint", async () => {
		const projectRoot = createProjectRoot();
		const sourceResultsDir = path.join(projectRoot, "results");
		const outputResultsDir = path.join(projectRoot, "published-results");
		fs.mkdirSync(sourceResultsDir, { recursive: true });
		fs.mkdirSync(outputResultsDir, { recursive: true });

		const checkpoint = computeBenchmarkCheckpoint(projectRoot);
		const publishedCheckpoint = {
			...checkpoint,
			checkpointId: "chk_sha256v1_published",
		};

		writeRunDir(
			sourceResultsDir,
			"run-published",
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-published",
				benchmarkCheckpoint: publishedCheckpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				startedAt: "2026-03-04T10:00:00.000Z",
				completedAt: "2026-03-04T10:01:00.000Z",
				durationMs: 60_000,
				summary: { total: 1, completed: 1, failed: 0, pending: 0 },
				items: [],
			},
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-published",
				createdAt: "2026-03-04T10:00:00.000Z",
				runtimeEnvironment: { platform: "darwin", bunVersion: "1.3.3" },
				benchmarkCheckpoint: publishedCheckpoint,
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
			sourceResultsDir,
			outputResultsDir,
			projectRoot,
		});

		expect(output.index.latestCheckpointId).toBe(
			publishedCheckpoint.checkpointId,
		);
		expect(output.latestAggregate.checkpointId).toBe(
			publishedCheckpoint.checkpointId,
		);
	});

	it("removes stale published files before rewriting bundles", async () => {
		const projectRoot = createProjectRoot();
		const sourceResultsDir = path.join(projectRoot, "results");
		const outputResultsDir = path.join(projectRoot, "published-results");
		fs.mkdirSync(sourceResultsDir, { recursive: true });
		fs.mkdirSync(path.join(outputResultsDir, "stale-run"), { recursive: true });
		fs.mkdirSync(path.join(outputResultsDir, "aggregates"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(outputResultsDir, "stale-run", "run.json"),
			'{"stale":true}\n',
		);
		fs.writeFileSync(
			path.join(outputResultsDir, "aggregates", "stale.json"),
			'{"stale":true}\n',
		);

		const checkpoint = computeBenchmarkCheckpoint(projectRoot);
		writeRunDir(
			sourceResultsDir,
			"run-fresh",
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-fresh",
				machine: buildMachine("machine-fresh"),
				benchmarkCheckpoint: checkpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				startedAt: "2026-03-05T10:00:00.000Z",
				completedAt: "2026-03-05T10:01:00.000Z",
				durationMs: 60_000,
				summary: {
					total: 1,
					completed: 1,
					failed: 0,
					pending: 0,
				},
				items: [],
			},
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-fresh",
				createdAt: "2026-03-05T10:00:00.000Z",
				machine: buildMachine("machine-fresh"),
				benchmarkCheckpoint: checkpoint,
				runtimeEnvironment: {
					platform: "darwin",
					bunVersion: "1.2.3",
				},
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				config: {
					schemaVersion: SCHEMA_VERSION,
					runtimes: ["ollama"],
					models: ["qwen3.5:4b"],
					harnesses: ["direct"],
					tests: ["smoke"],
					categories: [],
					passTypes: ["blind"],
					ollamaBaseUrl: "http://localhost:11434",
					vllmBaseUrl: "http://localhost:8000",
					generateTimeoutMs: 60_000,
					gooseMaxTurns: 1,
					gooseRetryMaxTurns: 3,
					gooseWorkspaceMaxTurns: 8,
					gooseWorkspaceRetryMaxTurns: 12,
					outputDir: "results",
					modelProfiles: {},
				},
				items: [
					{
						id: "01",
						runtime: "ollama",
						model: "qwen3.5:4b",
						harness: "direct",
						test: "smoke",
						category: "coding",
						scoringMode: "code-module",
						requiresTools: false,
						requiredHarnessCapabilities: [],
						tags: [],
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
				matrix: [],
			},
		);

		await buildDashboardIndexArtifacts({
			sourceResultsDir,
			outputResultsDir,
			projectRoot,
			latestCheckpointId: checkpoint.checkpointId,
		});

		expect(fs.existsSync(path.join(outputResultsDir, "stale-run"))).toBe(false);
		expect(
			fs.existsSync(path.join(outputResultsDir, "aggregates", "stale.json")),
		).toBe(false);
		expect(fs.existsSync(path.join(outputResultsDir, "run-fresh"))).toBe(true);
	});
});

describe("resolveResultsDir", () => {
	it("rejects flag names passed as directory values", () => {
		expect(() => resolveResultsDir(["--source-dir", "--output-dir"])).toThrow(
			"--source-dir requires a path",
		);
		expect(() => resolveResultsDir(["--output-dir", "--dir"])).toThrow(
			"--output-dir requires a path",
		);
		expect(() => resolveResultsDir(["--dir"])).toThrow("--dir requires a path");
	});
});
