#!/usr/bin/env bun
/**
 * Purpose: Build dashboard index metadata and checkpoint aggregate artifacts.
 * Exports: buildDashboardIndexArtifacts, resolveResultsDir
 *
 * Usage:
 *   bun run apps/dashboard/scripts/build-index.ts
 *   bun run apps/dashboard/scripts/build-index.ts --source-dir results --output-dir apps/dashboard/public/results
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { computeBenchmarkCheckpoint } from "../../../src/lib/benchmark-checkpoint.js";
import {
	parseKnownPlanPayload,
	parseKnownRunPayload,
} from "../../../src/lib/machine-profile/legacy.js";
import {
	type AggregateRunInput,
	aggregateRunsForCheckpoint,
	resolveRunMetadata,
	summarizeCheckpoints,
} from "../../../src/results/aggregate.js";
import {
	type RunPlan,
	type RunResult,
} from "../../../src/schemas/index.js";
import type {
	DashboardIndex,
	LeaderboardAggregate,
	RunListItem,
} from "../src/lib/types.js";

const DEFAULT_SOURCE_RESULTS_DIR = resolve(import.meta.dir, "../../../results");
const DEFAULT_OUTPUT_RESULTS_DIR = resolve(import.meta.dir, "../public/results");
const DEFAULT_PROJECT_ROOT = resolve(import.meta.dir, "../../..");

/** Output metadata from dashboard index build. */
export interface BuildDashboardIndexArtifactsResult {
	index: DashboardIndex;
	aggregatesWritten: number;
	latestAggregate: LeaderboardAggregate;
}

/** Build options for dashboard index generation. */
export interface BuildDashboardIndexArtifactsOptions {
	sourceResultsDir: string;
	outputResultsDir: string;
	projectRoot?: string;
	latestCheckpointId?: string;
}

const PUBLIC_PATH_PATTERNS = [
	/(?:\/Users\/|\/home\/|\/root\/|\/workspace\/|\/workspaces\/|\/Volumes\/|\/mnt\/|\/private\/var\/|\/var\/|\/tmp\/)[^\s"'`()<>]+/g,
	/(?<![A-Za-z])[A-Za-z]:[\\/][^\s"'`()<>]+/g,
] as const;
const STACK_FRAME_PATTERN = /^\s*at\s+(?:.+\s\(|\S+:\d+:\d+)/;

const KNOWN_WORKSPACE_SEGMENTS = [
	"artifacts/",
	"build/",
	"cache/",
	"checklist/",
	"config/",
	"docs/",
	"incoming/",
	"logs/",
	"notes/",
	"owners/",
	"records/",
	"releases/",
	"reports/",
	"scratch/",
	"src/",
	"trash/",
] as const;
const INTERNAL_TRACE_PATTERN =
	/THOUGHT:|"sessionID"|"type":"tool_use"|"type":"step_start"|"type":"step_finish"/i;

/**
 * Rewrites one absolute host path into a public-safe placeholder or stable workspace-relative path.
 *
 * @param rawPath - Raw absolute path captured in a run artifact
 * @returns Sanitized replacement safe for published JSON
 */
function sanitizePublicPath(rawPath: string): string {
	const withoutLineColumn = rawPath.replace(/:\d+(?::\d+)?$/, "");
	const normalizedPath = withoutLineColumn.replaceAll("\\", "/");
	for (const segment of KNOWN_WORKSPACE_SEGMENTS) {
		const marker = `/${segment}`;
		const segmentIndex = normalizedPath.indexOf(marker);
		if (segmentIndex !== -1) {
			return normalizedPath.slice(segmentIndex + 1);
		}
	}

	const fileName = basename(normalizedPath);
	return fileName.length > 0 ? `[path:${fileName}]` : "[path]";
}

/**
 * Sanitizes arbitrary published text by removing host-specific paths and stack-only lines.
 *
 * @param value - Arbitrary text from run artifacts
 * @returns Sanitized text safe for dashboard publication
 */
function sanitizePublishedText(value: string): string {
	const sanitized = value
		.split("\n")
		.filter((line) => !STACK_FRAME_PATTERN.test(line))
		.map((line) =>
			PUBLIC_PATH_PATTERNS.reduce(
				(nextLine, pattern) =>
					nextLine.replaceAll(pattern, (matchedPath) =>
						sanitizePublicPath(matchedPath),
					),
				line,
			),
		)
		.join("\n");
	return sanitized.replace(
		/(^|[\s"'`(])([A-Za-z0-9._/-]+)\[path:([^\]]+)\]/g,
		(_match, prefix: string, basePath: string, nestedPath: string) =>
			`${prefix}[path:${basePath}/${nestedPath}]`,
	);
}

/**
 * Recursively sanitizes strings inside arbitrary JSON-like published payloads.
 *
 * @param value - Unknown JSON-like value
 * @returns Sanitized clone
 */
function sanitizePublishedValue(value: unknown): unknown {
	if (typeof value === "string") {
		return sanitizePublishedText(value);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => sanitizePublishedValue(entry));
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				sanitizePublishedValue(entry),
			]),
		);
	}
	return value;
}

/**
 * Removes host-specific details from a run before using it in published dashboard artifacts.
 *
 * @param run - Parsed run artifact
 * @returns Sanitized run artifact
 */
function sanitizePublishedRun(run: RunResult): RunResult {
	return sanitizePublishedValue({
		...run,
		items: run.items.map((item) => ({
			...item,
			...(item.generation
				? {
						generation: {
							...item.generation,
							...(item.generation.output
								? {
										output: INTERNAL_TRACE_PATTERN.test(item.generation.output)
											? "[redacted internal tool transcript]"
											: sanitizePublishedText(item.generation.output),
									}
								: {}),
							...(item.generation.error
								? {
										error: sanitizePublishedText(item.generation.error),
									}
								: {}),
							...(item.generation.codeFilePath
								? {
										sourcePathToken: sanitizePublicPath(
											item.generation.codeFilePath,
										),
									}
								: {}),
							codeFilePath: undefined,
						},
					}
				: {}),
			...(item.generationFailure
				? {
						generationFailure: {
							...item.generationFailure,
							message: sanitizePublishedText(item.generationFailure.message),
						},
					}
				: {}),
			...(item.scoringFailure
				? {
						scoringFailure: {
							...item.scoringFailure,
							message: sanitizePublishedText(item.scoringFailure.message),
						},
					}
				: {}),
			...(item.frontierEvalFailure
				? {
						frontierEvalFailure: {
							...item.frontierEvalFailure,
							message: sanitizePublishedText(item.frontierEvalFailure.message),
						},
					}
				: {}),
		})),
	}) as RunResult;
}

/**
 * Removes host-specific details from a plan before publishing.
 *
 * @param plan - Parsed plan artifact
 * @returns Sanitized plan artifact
 */
function sanitizePublishedPlan(plan: RunPlan): RunPlan {
	return sanitizePublishedValue(plan) as RunPlan;
}

interface PublishedRunBundle extends AggregateRunInput {
	runDirName: string;
}

/**
 * Resolves the results directories used for scanning runs and publishing artifacts.
 *
 * Rules:
 * - Default source: repo-root `results/`
 * - Default output: `apps/dashboard/public/results`
 * - `--dir <path>` remains a backwards-compatible alias for `--output-dir <path>`
 * - `--source-dir <path>` and `--output-dir <path>` are resolved from process cwd
 *
 * @param argv - CLI argv values after script path
 * @returns Absolute source/output results directory paths
 * @throws {Error} When a directory flag is supplied without a value
 */
export function resolveResultsDir(argv: string[]): {
	sourceResultsDir: string;
	outputResultsDir: string;
} {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(
			"Usage: bun run apps/dashboard/scripts/build-index.ts [--source-dir <path>] [--output-dir <path>]",
		);
		console.log("");
		console.log("Default source directory: results");
		console.log("Default output directory: apps/dashboard/public/results");
		process.exit(0);
	}

	const sourceFlagIndex = argv.indexOf("--source-dir");
	const outputFlagIndex = argv.indexOf("--output-dir");
	const legacyDirFlagIndex = argv.indexOf("--dir");

	const sourceDirArg =
		sourceFlagIndex === -1 ? undefined : argv.at(sourceFlagIndex + 1);
	if (sourceFlagIndex !== -1) {
		if (
			typeof sourceDirArg !== "string" ||
			sourceDirArg.trim().length === 0 ||
			sourceDirArg.trim().startsWith("--")
		) {
			throw new Error("--source-dir requires a path");
		}
	}

	const outputDirArg =
		outputFlagIndex !== -1
			? argv.at(outputFlagIndex + 1)
			: legacyDirFlagIndex !== -1
				? argv.at(legacyDirFlagIndex + 1)
				: undefined;
	if (outputFlagIndex !== -1 || legacyDirFlagIndex !== -1) {
		if (
			typeof outputDirArg !== "string" ||
			outputDirArg.trim().length === 0 ||
			outputDirArg.trim().startsWith("--")
		) {
			throw new Error(
				outputFlagIndex !== -1
					? "--output-dir requires a path"
					: "--dir requires a path",
			);
		}
	}

	return {
		sourceResultsDir:
			typeof sourceDirArg === "string"
				? resolve(process.cwd(), sourceDirArg)
				: DEFAULT_SOURCE_RESULTS_DIR,
		outputResultsDir:
			typeof outputDirArg === "string"
				? resolve(process.cwd(), outputDirArg)
				: DEFAULT_OUTPUT_RESULTS_DIR,
	};
}

/**
 * Reads `run.json` and optional `plan.json` from a run directory.
 *
 * @param runDir - Absolute run directory path
 * @returns Parsed run bundle or undefined when run.json is missing/invalid
 */
async function readRunBundle(
	runDir: string,
): Promise<PublishedRunBundle | undefined> {
	const runJsonPath = join(runDir, "run.json");
	try {
		const content = await readFile(runJsonPath, "utf-8");
		let run: RunResult;
		try {
			run = parseKnownRunPayload(JSON.parse(content) as unknown);
		} catch {
			return undefined;
		}

		const planJsonPath = join(runDir, "plan.json");
		let plan: AggregateRunInput["plan"] | undefined;
		try {
			const planContent = await readFile(planJsonPath, "utf-8");
			plan = sanitizePublishedPlan(
				parseKnownPlanPayload(JSON.parse(planContent) as unknown),
			);
		} catch {
			plan = undefined;
		}

		return {
			runDirName: basename(runDir),
			run: sanitizePublishedRun(run),
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
			...(metadata.machineProfileKey
				? { machineProfileKey: metadata.machineProfileKey }
				: {}),
			...(metadata.machineProfileKey
				? { machineProfileId: metadata.machineProfileKey }
				: {}),
			...(metadata.machineProfileLabel
				? { machineProfileLabel: metadata.machineProfileLabel }
				: {}),
			...(metadata.machineDisplayLabel ?? metadata.machineProfileLabel
				? {
						machineLabel:
							metadata.machineDisplayLabel ?? metadata.machineProfileLabel,
					}
				: {}),
			...(metadata.machineInstanceId
				? { machineInstanceId: metadata.machineInstanceId }
				: {}),
			...(metadata.machineDisplayLabel
				? { machineDisplayLabel: metadata.machineDisplayLabel }
				: {}),
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
 * Writes sanitized run/plan artifacts into the published results tree.
 *
 * @param bundles - Parsed sanitized bundles
 * @param outputResultsDir - Published results directory
 */
async function writePublishedRunBundles(
	bundles: PublishedRunBundle[],
	outputResultsDir: string,
): Promise<void> {
	await rm(outputResultsDir, { recursive: true, force: true });
	await mkdir(outputResultsDir, { recursive: true });
	for (const bundle of bundles) {
		const outputRunDir = join(outputResultsDir, bundle.runDirName);
		await mkdir(outputRunDir, { recursive: true });
		await writeFile(
			join(outputRunDir, "run.json"),
			`${JSON.stringify(bundle.run, null, 2)}\n`,
			"utf-8",
		);
		if (bundle.plan) {
			await writeFile(
				join(outputRunDir, "plan.json"),
				`${JSON.stringify(bundle.plan, null, 2)}\n`,
				"utf-8",
			);
		}
	}
}

/**
 * Resolves the checkpoint that `latest.json` and `index.latestCheckpointId` should target.
 *
 * Prefers the current benchmark checkpoint when it is already represented in the published run set.
 * Otherwise falls back to the newest checkpoint actually present in the index.
 *
 * @param checkpoints - Published checkpoint summaries sorted newest-first
 * @param preferredCheckpointId - Preferred checkpoint ID from config/current project state
 * @returns Checkpoint ID to publish as the latest aggregate target
 */
function resolveLatestCheckpointId(
	checkpoints: DashboardIndex["checkpoints"],
	preferredCheckpointId: string,
): string {
	if (
		checkpoints.some(
			(checkpoint) => checkpoint.checkpointId === preferredCheckpointId,
		)
	) {
		return preferredCheckpointId;
	}
	return checkpoints[0]?.checkpointId ?? preferredCheckpointId;
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
	const sourceResultsDir = resolve(options.sourceResultsDir);
	const outputResultsDir = resolve(options.outputResultsDir);
	const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
	const indexPath = join(outputResultsDir, "index.json");
	const aggregatesDir = join(outputResultsDir, "aggregates");

	const entries = await readdir(sourceResultsDir, { withFileTypes: true });
	const bundles: PublishedRunBundle[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "aggregates") continue;
		const runDir = join(sourceResultsDir, entry.name);
		const bundle = await readRunBundle(runDir);
		if (bundle) {
			bundles.push(bundle);
		}
	}
	await writePublishedRunBundles(bundles, outputResultsDir);
	await mkdir(aggregatesDir, { recursive: true });

	const checkpoints = summarizeCheckpoints(bundles);
	const preferredLatestCheckpointId =
		options.latestCheckpointId ??
		computeBenchmarkCheckpoint(projectRoot).checkpointId;
	const latestCheckpointId = resolveLatestCheckpointId(
		checkpoints,
		preferredLatestCheckpointId,
	);
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
	const { sourceResultsDir, outputResultsDir } = resolveResultsDir(
		process.argv.slice(2),
	);
	console.log(`Scanning ${sourceResultsDir} for runs...`);
	console.log(`Writing dashboard artifacts to ${outputResultsDir}...`);
	const result = await buildDashboardIndexArtifacts({
		sourceResultsDir,
		outputResultsDir,
	});
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
