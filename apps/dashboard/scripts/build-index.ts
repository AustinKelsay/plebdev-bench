#!/usr/bin/env bun
/**
 * Purpose: Build dashboard index metadata and checkpoint aggregate artifacts.
 * Exports: buildDashboardIndexArtifacts, resolveResultsDir
 *
 * Usage:
 *   bun run apps/dashboard/scripts/build-index.ts
 *   bun run apps/dashboard/scripts/build-index.ts --dir apps/dashboard/public/results
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { computeBenchmarkCheckpoint } from "../../../src/lib/benchmark-checkpoint.js";
import {
	type AggregateRunInput,
	aggregateRunsForCheckpoint,
	resolveRunMetadata,
	summarizeCheckpoints,
} from "../../../src/results/aggregate.js";
import { RunPlanSchema, RunResultSchema } from "../../../src/schemas/index.js";
import type {
	DashboardIndex,
	LeaderboardAggregate,
	RunListItem,
} from "../src/lib/types.js";

const DEFAULT_RESULTS_DIR = resolve(import.meta.dir, "../public/results");
const DEFAULT_PROJECT_ROOT = resolve(import.meta.dir, "../../..");

/** Output metadata from dashboard index build. */
export interface BuildDashboardIndexArtifactsResult {
	index: DashboardIndex;
	aggregatesWritten: number;
	latestAggregate: LeaderboardAggregate;
}

/** Build options for dashboard index generation. */
export interface BuildDashboardIndexArtifactsOptions {
	resultsDir: string;
	projectRoot?: string;
	latestCheckpointId?: string;
}

/**
 * Resolves the results directory to scan.
 *
 * Rules:
 * - Default: apps/dashboard/public/results
 * - Optional: `--dir <path>` resolved from process cwd
 *
 * @param argv - CLI argv values after script path
 * @returns Absolute results directory path
 * @throws {Error} If `--dir` is supplied without a value
 */
export function resolveResultsDir(argv: string[]): string {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(
			"Usage: bun run apps/dashboard/scripts/build-index.ts [--dir <path>]",
		);
		console.log("");
		console.log("Default directory: apps/dashboard/public/results");
		process.exit(0);
	}

	const dirFlagIndex = argv.indexOf("--dir");
	if (dirFlagIndex === -1) return DEFAULT_RESULTS_DIR;

	const dirArg = argv.at(dirFlagIndex + 1);
	if (typeof dirArg !== "string" || dirArg.trim().length === 0) {
		throw new Error("--dir requires a path");
	}
	return resolve(process.cwd(), dirArg);
}

/**
 * Reads `run.json` and optional `plan.json` from a run directory.
 *
 * @param runDir - Absolute run directory path
 * @returns Parsed run bundle or undefined when run.json is missing/invalid
 */
async function readRunBundle(
	runDir: string,
): Promise<AggregateRunInput | undefined> {
	const runJsonPath = join(runDir, "run.json");
	try {
		const content = await readFile(runJsonPath, "utf-8");
		const runParsed = RunResultSchema.safeParse(JSON.parse(content) as unknown);
		if (!runParsed.success) {
			return undefined;
		}

		const planJsonPath = join(runDir, "plan.json");
		let plan: AggregateRunInput["plan"] | undefined;
		try {
			const planContent = await readFile(planJsonPath, "utf-8");
			const planParsed = RunPlanSchema.safeParse(
				JSON.parse(planContent) as unknown,
			);
			if (planParsed.success) {
				plan = planParsed.data;
			}
		} catch {
			plan = undefined;
		}

		return {
			run: runParsed.data,
			...(plan ? { plan } : {}),
		};
	} catch {
		return undefined;
	}
}

/**
 * Maps parsed runs to dashboard run-list entries with checkpoint/machine metadata.
 *
 * @param bundles - Parsed run bundles
 * @returns Run-list entries sorted newest-first by startedAt
 */
function buildRunListItems(bundles: AggregateRunInput[]): RunListItem[] {
	const runs = bundles.map((bundle) => {
		const metadata = resolveRunMetadata(bundle);
		return {
			runId: bundle.run.runId,
			startedAt: bundle.run.startedAt,
			completedAt: bundle.run.completedAt,
			durationMs: bundle.run.durationMs,
			summary: bundle.run.summary,
			...(metadata.checkpointId ? { checkpointId: metadata.checkpointId } : {}),
			...(metadata.machineProfileId
				? { machineProfileId: metadata.machineProfileId }
				: {}),
			...(metadata.machineLabel ? { machineLabel: metadata.machineLabel } : {}),
			...(metadata.verificationStatus
				? { verificationStatus: metadata.verificationStatus }
				: {}),
			isLegacy: metadata.isLegacy,
		};
	});

	runs.sort(
		(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	);
	return runs;
}

/**
 * Builds dashboard index metadata and checkpoint aggregate files.
 *
 * @param options - Build options
 * @returns Generated index + latest aggregate metadata
 */
export async function buildDashboardIndexArtifacts(
	options: BuildDashboardIndexArtifactsOptions,
): Promise<BuildDashboardIndexArtifactsResult> {
	const resultsDir = resolve(options.resultsDir);
	const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
	const indexPath = join(resultsDir, "index.json");
	const aggregatesDir = join(resultsDir, "aggregates");

	await mkdir(resultsDir, { recursive: true });
	await mkdir(aggregatesDir, { recursive: true });

	const entries = await readdir(resultsDir, { withFileTypes: true });
	const bundles: AggregateRunInput[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "aggregates") continue;
		const runDir = join(resultsDir, entry.name);
		const bundle = await readRunBundle(runDir);
		if (bundle) {
			bundles.push(bundle);
		}
	}

	const checkpoints = summarizeCheckpoints(bundles);
	const latestCheckpointId =
		options.latestCheckpointId ??
		computeBenchmarkCheckpoint(projectRoot).checkpointId;
	const runs = buildRunListItems(bundles);

	const index: DashboardIndex = {
		schemaVersion: 2,
		generatedAt: new Date().toISOString(),
		latestCheckpointId,
		runs,
		checkpoints,
	};

	await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

	let aggregatesWritten = 0;
	for (const checkpoint of checkpoints) {
		const aggregate = aggregateRunsForCheckpoint(
			bundles,
			checkpoint.checkpointId,
		);
		await writeFile(
			join(aggregatesDir, `${checkpoint.checkpointId}.json`),
			JSON.stringify(aggregate, null, 2),
			"utf-8",
		);
		aggregatesWritten += 1;
	}

	const latestAggregate = aggregateRunsForCheckpoint(
		bundles,
		latestCheckpointId,
	);
	await writeFile(
		join(aggregatesDir, `${latestCheckpointId}.json`),
		JSON.stringify(latestAggregate, null, 2),
		"utf-8",
	);
	if (
		!checkpoints.some(
			(checkpoint) => checkpoint.checkpointId === latestCheckpointId,
		)
	) {
		aggregatesWritten += 1;
	}
	await writeFile(
		join(aggregatesDir, "latest.json"),
		JSON.stringify(latestAggregate, null, 2),
		"utf-8",
	);

	return {
		index,
		aggregatesWritten,
		latestAggregate,
	};
}

/**
 * CLI entrypoint wrapper for dashboard index generation.
 */
async function runCli(): Promise<void> {
	const resultsDir = resolveResultsDir(process.argv.slice(2));
	console.log(`Scanning ${resultsDir} for runs...`);
	const result = await buildDashboardIndexArtifacts({ resultsDir });
	console.log(
		`Wrote index with ${result.index.runs.length} runs (${result.index.checkpoints.length} checkpoints)`,
	);
	console.log(
		`Wrote ${result.aggregatesWritten + 1} aggregate files (including latest.json)`,
	);
	console.log(`Latest checkpoint: ${result.index.latestCheckpointId}`);
}

if (import.meta.main) {
	runCli().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
