/**
 * Purpose: Verify legacy machine artifact migration and CLI rewrite behavior.
 * Exports: none
 *
 * Invariants:
 * - Uses temporary directories only; no shared repo state is mutated
 * - Executes deterministic fixture migrations under Vitest
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	LEGACY_ARTIFACT_SCHEMA_VERSIONS,
	migrateLegacyMachineProfile,
	migrateLegacyPlanPayload,
	migrateLegacyRunPayload,
	parseKnownPlanPayload,
	parseKnownRunPayload,
} from "../src/lib/machine-profile/legacy.js";
import {
	RunPlanSchema,
	RunResultSchema,
	SCHEMA_VERSION,
} from "../src/schemas/index.js";

const tempRoots: string[] = [];
const REPO_ROOT = process.cwd();
const BUN_EXECUTABLE = "bun";

const LEGACY_MACHINE = {
	profileId: "mac-mini-m4-pro-64gb",
	label: "Mac Mini M4 Pro 64GB",
	hardware: {
		platform: "darwin",
		arch: "arm64",
		osRelease: "25.3.0",
		cpuModel: "Apple M4 Pro",
		logicalCores: 12,
		totalMemoryBytes: 68_719_476_736,
	},
};
const LEGACY_INSTANCE_ID = "legacy_profile:mac-mini-m4-pro-64gb";
const LEGACY_PROFILE_KEY =
	"macos_arm64_apple-m4-pro_12c_64gb_unknown_na_xunknown";

function createTempRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "plebdev-bench-migrate-"));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("legacy machine-profile migration", () => {
	it("converts legacy machine payloads into standardized profiles", () => {
		const migrated = migrateLegacyMachineProfile(LEGACY_MACHINE);
		expect(migrated).toBeDefined();
		expect(migrated?.instanceId).toBe(LEGACY_INSTANCE_ID);
		expect(migrated?.instanceIdSource).toBe("legacy_profile_id");
		expect(migrated?.displayLabel).toBe("Mac Mini M4 Pro 64GB");
		expect(migrated?.profileKey).toBe(LEGACY_PROFILE_KEY);
		expect(migrated?.profileLabel).toBe(
			"Apple M4 Pro / 64GB / Accelerator unknown",
		);
		expect(migrated?.observedHardware.acceleratorDetection.status).toBe(
			"unavailable",
		);
	});

	it("upgrades legacy plan/run payloads to the current schema version", () => {
		const plan = migrateLegacyPlanPayload({
			schemaVersion: "0.3.0",
			runId: "run-legacy",
			createdAt: "2026-03-05T21:51:18.583Z",
			environment: {
				platform: "darwin",
				bunVersion: "1.3.3",
			},
			machine: LEGACY_MACHINE,
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
		});
		const run = migrateLegacyRunPayload({
			schemaVersion: "0.3.0",
			runId: "run-legacy",
			machine: LEGACY_MACHINE,
			startedAt: "2026-03-05T21:51:18.583Z",
			completedAt: "2026-03-05T21:52:18.583Z",
			durationMs: 60_000,
			summary: {
				total: 0,
				completed: 0,
				failed: 0,
				pending: 0,
			},
			items: [],
		});

		const parsedPlan = RunPlanSchema.parse(plan);
		const parsedRun = RunResultSchema.parse(run);
		const knownPlan = parseKnownPlanPayload(plan);
		const knownRun = parseKnownRunPayload(run);

		expect(parsedPlan.schemaVersion).toBe(SCHEMA_VERSION);
		expect(parsedPlan.runtimeEnvironment?.platform).toBe("darwin");
		expect(parsedPlan.machine?.instanceIdSource).toBe("legacy_profile_id");
		expect(parsedRun.schemaVersion).toBe(SCHEMA_VERSION);
		expect(parsedRun.machine?.profileKey).toBe(LEGACY_PROFILE_KEY);
		expect(knownPlan.machine?.instanceIdSource).toBe("legacy_profile_id");
		expect(knownRun.machine?.profileKey).toBe(LEGACY_PROFILE_KEY);
	});

	it("accepts prior current-version artifacts after a schema bump", () => {
		expect(LEGACY_ARTIFACT_SCHEMA_VERSIONS.has("0.5.0")).toBe(true);
		const parsedPlan = parseKnownPlanPayload({
			schemaVersion: "0.5.0",
			runId: "run-current-minus-one",
			createdAt: "2026-03-05T21:51:18.583Z",
			runtimeEnvironment: {
				platform: "darwin",
				bunVersion: "1.3.3",
			},
			machine: LEGACY_MACHINE,
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
		});
		const parsedRun = parseKnownRunPayload({
			schemaVersion: "0.5.0",
			runId: "run-current-minus-one",
			machine: LEGACY_MACHINE,
			startedAt: "2026-03-05T21:51:18.583Z",
			completedAt: "2026-03-05T21:52:18.583Z",
			durationMs: 60_000,
			summary: {
				total: 0,
				completed: 0,
				failed: 0,
				pending: 0,
			},
			items: [],
		});

		expect(parsedPlan.schemaVersion).toBe(SCHEMA_VERSION);
		expect(parsedPlan.machine?.profileKey).toBe(LEGACY_PROFILE_KEY);
		expect(parsedRun.schemaVersion).toBe(SCHEMA_VERSION);
		expect(parsedRun.machine?.profileKey).toBe(LEGACY_PROFILE_KEY);
	});
});

describe("migrate-machine-profiles command", () => {
	it("rewrites legacy artifacts and rebuilds dashboard index output", () => {
		const root = createTempRoot();
		const resultsDir = path.join(root, "results");
		const dashboardOutputDir = path.join(root, "published-results");
		const runDir = path.join(resultsDir, "run-legacy");
		fs.mkdirSync(runDir, { recursive: true });
		fs.mkdirSync(dashboardOutputDir, { recursive: true });

		const benchmarkCheckpoint = {
			checkpointId: "chk_sha256v1_testfixture",
			algorithm: "sha256v1",
			manifestHash: "testfixture",
			assetCount: 1,
			computedAt: "2026-03-05T21:51:18.583Z",
		};

		fs.writeFileSync(
			path.join(runDir, "plan.json"),
			`${JSON.stringify(
				{
					schemaVersion: "0.3.0",
					runId: "run-legacy",
					createdAt: "2026-03-05T21:51:18.583Z",
					environment: {
						platform: "darwin",
						bunVersion: "1.3.3",
					},
					machine: LEGACY_MACHINE,
					benchmarkCheckpoint,
					extraMetadata: { keep: "plan" },
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
							model: "qwen3.5:4b",
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
				null,
				2,
			)}\n`,
		);
		fs.writeFileSync(
			path.join(runDir, "run.json"),
			`${JSON.stringify(
				{
					schemaVersion: "0.3.0",
					runId: "run-legacy",
					machine: LEGACY_MACHINE,
					benchmarkCheckpoint,
					extraMetadata: { keep: "run" },
					startedAt: "2026-03-05T21:51:18.583Z",
					completedAt: "2026-03-05T21:52:18.583Z",
					durationMs: 60_000,
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
							model: "qwen3.5:4b",
							harness: "direct",
							test: "smoke",
							passType: "blind",
							status: "completed",
							generation: {
								success: true,
								output: "export function add(a, b) { return a + b; }",
								durationMs: 1000,
							},
						},
					],
				},
				null,
				2,
			)}\n`,
		);

		const completed = spawnSync(
			BUN_EXECUTABLE,
			[
				"run",
				"src/index.ts",
				"migrate-machine-profiles",
				"--dir",
				resultsDir,
				"--rebuild-dashboard-index",
				"--dashboard-output-dir",
				dashboardOutputDir,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf-8",
			},
		);

		expect(completed.status).toBe(0);
		expect(completed.stderr).not.toMatch(/(error|fatal|traceback)/i);

		const migratedPlan = RunPlanSchema.parse(
			JSON.parse(fs.readFileSync(path.join(runDir, "plan.json"), "utf-8")),
		);
		const migratedRun = RunResultSchema.parse(
			JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf-8")),
		);
		const index = JSON.parse(
			fs.readFileSync(path.join(dashboardOutputDir, "index.json"), "utf-8"),
		) as {
			schemaVersion: number;
			runs: Array<{
				machineProfileKey?: string;
				machineInstanceId?: string;
			}>;
		};
		const latestAggregate = JSON.parse(
			fs.readFileSync(
				path.join(dashboardOutputDir, "aggregates", "latest.json"),
				"utf-8",
			),
		) as {
			schemaVersion: number;
			summary: { machines: number; instances: number };
		};

		expect(migratedPlan.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migratedPlan.machine?.instanceIdSource).toBe("legacy_profile_id");
		expect(
			(
				JSON.parse(
					fs.readFileSync(path.join(runDir, "plan.json"), "utf-8"),
				) as {
					extraMetadata?: { keep?: string };
				}
			).extraMetadata?.keep,
		).toBe("plan");
		expect(migratedRun.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migratedRun.machine?.profileKey).toBe(LEGACY_PROFILE_KEY);
		expect(
			(
				JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf-8")) as {
					extraMetadata?: { keep?: string };
				}
			).extraMetadata?.keep,
		).toBe("run");
		expect(index.schemaVersion).toBe(3);
		expect(index.runs[0]?.machineProfileKey).toBe(LEGACY_PROFILE_KEY);
		expect(index.runs[0]?.machineInstanceId).toMatch(/^machine-[0-9a-f]{12}$/);
		expect(latestAggregate.schemaVersion).toBe(2);
		expect(latestAggregate.summary.machines).toBe(1);
		expect(latestAggregate.summary.instances).toBe(1);
	});

	it("requires --dashboard-output-dir when rebuilding dashboard artifacts", () => {
		const root = createTempRoot();
		const resultsDir = path.join(root, "results");
		fs.mkdirSync(resultsDir, { recursive: true });

		const completed = spawnSync(
			BUN_EXECUTABLE,
			[
				"run",
				"src/index.ts",
				"migrate-machine-profiles",
				"--dir",
				resultsDir,
				"--rebuild-dashboard-index",
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf-8",
			},
		);

		expect(completed.status).toBe(1);
		expect(completed.stdout).toContain("--dashboard-output-dir");
	});

	it("rejects dashboard output directories that overlap the source results tree", () => {
		const root = createTempRoot();
		const resultsDir = path.join(root, "results");
		const nestedOutputDir = path.join(resultsDir, "published-results");
		fs.mkdirSync(nestedOutputDir, { recursive: true });

		const completed = spawnSync(
			BUN_EXECUTABLE,
			[
				"run",
				"src/index.ts",
				"migrate-machine-profiles",
				"--dir",
				resultsDir,
				"--rebuild-dashboard-index",
				"--dashboard-output-dir",
				nestedOutputDir,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf-8",
			},
		);

		expect(completed.status).toBe(1);
		expect(completed.stdout).toContain("--dashboard-output-dir");
	});
});

describe("known artifact parsing", () => {
	it("rejects unsupported run and plan schema versions", () => {
		expect(() =>
			parseKnownPlanPayload({
				schemaVersion: "9.9.9",
				runId: "bad-plan",
			}),
		).toThrow("Unsupported plan artifact schemaVersion: 9.9.9");
		expect(() =>
			parseKnownRunPayload({
				schemaVersion: "9.9.9",
				runId: "bad-run",
			}),
		).toThrow("Unsupported run artifact schemaVersion: 9.9.9");
	});
});
