/**
 * Purpose: Verify dashboard index generation preserves Hermes run coordinates.
 * Exports: none
 *
 * Invariants:
 * - Hermes remains an ordinary harness dimension in published run bundles.
 * - Test fixtures include only the benchmark assets needed for checkpointing.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDashboardIndexArtifacts } from "../apps/dashboard/scripts/build-index.js";
import {
	CORE_BENCHMARK_LIB_ASSETS,
	computeBenchmarkCheckpoint,
} from "../src/lib/benchmark-checkpoint.js";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "../src/lib/machine-profile/normalization.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

const tempRoots: string[] = [];
const REQUIRED_LIB_ASSET_PREFIX = "src/lib/";
const REQUIRED_LIB_ASSETS = CORE_BENCHMARK_LIB_ASSETS.map((assetPath) =>
	assetPath.slice(REQUIRED_LIB_ASSET_PREFIX.length),
);
const TEST_HARDWARE = {
	platform: "darwin",
	arch: "arm64",
	osRelease: "25.5.0",
	cpuModelRaw: "Apple M4 Pro",
	logicalCores: 12,
	totalMemoryBytes: 68_719_476_736,
	accelerators: [
		{
			vendor: "Apple",
			modelRaw: "Apple M4 Pro",
			kind: "integrated" as const,
			backend: "metal",
		},
	],
	acceleratorDetection: { status: "detected" as const },
};
const TEST_PROFILE = normalizeMachineProfile(TEST_HARDWARE);
const TEST_PROFILE_KEY = buildMachineProfileKey(TEST_PROFILE);
const TEST_PROFILE_LABEL = buildMachineProfileLabel(
	TEST_HARDWARE,
	TEST_PROFILE,
);

function createProjectRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "plebdev-hermes-index-"));
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
		const targetPath = path.join(libRoot, filename);
		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		fs.writeFileSync(
			targetPath,
			`export const value = ${JSON.stringify(filename)};\n`,
		);
	}
	for (const [dirPath, filename] of [
		["src/harnesses", "direct-adapter.ts"],
		["src/runtimes", "ollama-runtime.ts"],
		["src/runner", "index.ts"],
	] as const) {
		const absoluteDir = path.join(root, dirPath);
		fs.mkdirSync(absoluteDir, { recursive: true });
		fs.writeFileSync(
			path.join(absoluteDir, filename),
			"export const value = 1;\n",
		);
	}
	return root;
}

function buildMachine(instanceId: string) {
	return {
		instanceId,
		instanceIdSource: "config" as const,
		displayLabel: "Hermes Test Machine",
		profileKey: TEST_PROFILE_KEY,
		profileLabel: TEST_PROFILE_LABEL,
		normalizedProfile: TEST_PROFILE,
		observedHardware: TEST_HARDWARE,
	};
}

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

describe("Hermes dashboard index publication", () => {
	it("preserves Hermes harness coordinates in published run and aggregate artifacts", async () => {
		const projectRoot = createProjectRoot();
		const sourceResultsDir = path.join(projectRoot, "results");
		const outputResultsDir = path.join(projectRoot, "published-results");
		fs.mkdirSync(sourceResultsDir, { recursive: true });
		fs.mkdirSync(outputResultsDir, { recursive: true });

		const checkpoint = computeBenchmarkCheckpoint(projectRoot);
		const item = {
			id: "01",
			runtime: "ollama",
			model: "qwen3.6:35b",
			harness: "hermes",
			test: "smoke",
			category: "coding",
			scoringMode: "code-module",
			requiresTools: false,
			requiredHarnessCapabilities: [],
			tags: ["baseline", "stateless"],
			passType: "blind",
			status: "completed",
			startedAt: "2026-06-19T14:00:00.000Z",
			completedAt: "2026-06-19T14:00:30.000Z",
			generation: {
				success: true,
				output: "export function add(a: number, b: number) { return a + b; }",
				durationMs: 30_000,
			},
			automatedScore: { passed: 6, failed: 0, total: 6 },
		};
		const machine = buildMachine("machine-hermes");

		writeRunDir(
			sourceResultsDir,
			"run-hermes",
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-hermes",
				machine,
				benchmarkCheckpoint: checkpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				startedAt: "2026-06-19T14:00:00.000Z",
				completedAt: "2026-06-19T14:00:30.000Z",
				durationMs: 30_000,
				summary: { total: 1, completed: 1, failed: 0, pending: 0 },
				items: [item],
			},
			{
				schemaVersion: SCHEMA_VERSION,
				runId: "run-hermes",
				createdAt: "2026-06-19T14:00:00.000Z",
				runtimeEnvironment: { platform: "darwin", bunVersion: "1.3.3" },
				machine,
				benchmarkCheckpoint: checkpoint,
				provenance: {
					verificationStatus: "self_reported",
					source: "local_cli",
				},
				config: {
					schemaVersion: SCHEMA_VERSION,
					runtimes: ["ollama"],
					models: ["qwen3.6:35b"],
					harnesses: ["hermes"],
					tests: ["smoke"],
					categories: [],
					passTypes: ["blind"],
					ollamaBaseUrl: "http://localhost:11434",
					generateTimeoutMs: 300_000,
					gooseMaxTurns: 1,
					gooseRetryMaxTurns: 3,
					gooseWorkspaceMaxTurns: 8,
					gooseWorkspaceRetryMaxTurns: 12,
					hermesMaxTurns: 1,
					hermesRetryMaxTurns: 3,
					hermesWorkspaceMaxTurns: 8,
					hermesWorkspaceRetryMaxTurns: 12,
					outputDir: "results",
					modelProfiles: {},
				},
				items: [item],
				summary: {
					totalItems: 1,
					runtimes: 1,
					models: 1,
					harnesses: 1,
					tests: 1,
				},
			},
		);

		const output = await buildDashboardIndexArtifacts({
			sourceResultsDir,
			outputResultsDir,
			projectRoot,
			latestCheckpointId: checkpoint.checkpointId,
		});

		expect(output.index.runs.map((run) => run.runId)).toEqual(["run-hermes"]);
		expect(output.latestAggregate.items).toHaveLength(1);
		expect(output.latestAggregate.items[0]?.harness).toBe("hermes");
		expect(output.latestAggregate.items[0]?.runtime).toBe("ollama");
		expect(output.latestAggregate.items[0]?.test).toBe("smoke");
		expect(output.index.runs[0]?.machineInstanceId).toBe(
			`machine-${createHash("sha256").update("machine-hermes").digest("hex").slice(0, 12)}`,
		);

		const publishedRun = JSON.parse(
			fs.readFileSync(
				path.join(outputResultsDir, "run-hermes", "run.json"),
				"utf-8",
			),
		) as { items: Array<{ harness?: string }> };
		expect(publishedRun.items[0]?.harness).toBe("hermes");
	});
});
