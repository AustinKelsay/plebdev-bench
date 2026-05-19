#!/usr/bin/env bun
/**
 * Purpose: Build dashboard index metadata and checkpoint aggregate artifacts.
 * Exports: buildDashboardIndexArtifacts, resolveResultsDir
 *
 * Usage:
 *   bun run apps/dashboard/scripts/build-index.ts
 *   bun run apps/dashboard/scripts/build-index.ts --source-dir results --output-dir apps/dashboard/public/results
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import type { RunPlan, RunResult } from "../../../src/schemas/index.js";
import type {
	DashboardIndex,
	LeaderboardAggregate,
	RunListItem,
} from "../src/lib/types.js";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_SOURCE_RESULTS_DIR = resolve(SCRIPT_DIR, "../../../results");
const DEFAULT_OUTPUT_RESULTS_DIR = resolve(SCRIPT_DIR, "../public/results");
const DEFAULT_PROJECT_ROOT = resolve(SCRIPT_DIR, "../../..");

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

/**
 * Returns true when `candidate` is equal to or nested inside `basePath`.
 *
 * @param basePath - Base directory
 * @param candidate - Candidate path to compare
 * @returns True when the candidate is the same path or a descendant
 */
function isSameOrNestedPath(basePath: string, candidate: string): boolean {
	const resolvedBase = resolve(basePath);
	const resolvedCandidate = resolve(candidate);
	const rel = relative(resolvedBase, resolvedCandidate);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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
		...(run.machine
			? {
					machine: {
						...run.machine,
						instanceId: sanitizeMachineInstanceId(run.machine.instanceId),
					},
				}
			: {}),
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
										error: INTERNAL_TRACE_PATTERN.test(item.generation.error)
											? "[redacted internal tool transcript]"
											: sanitizePublishedText(item.generation.error),
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
							message: INTERNAL_TRACE_PATTERN.test(
								item.generationFailure.message,
							)
								? "[redacted internal tool transcript]"
								: sanitizePublishedText(item.generationFailure.message),
						},
					}
				: {}),
			...(item.scoringFailure
				? {
						scoringFailure: {
							...item.scoringFailure,
							message: INTERNAL_TRACE_PATTERN.test(item.scoringFailure.message)
								? "[redacted internal tool transcript]"
								: sanitizePublishedText(item.scoringFailure.message),
						},
					}
				: {}),
			...(item.frontierEvalFailure
				? {
						frontierEvalFailure: {
							...item.frontierEvalFailure,
							message: INTERNAL_TRACE_PATTERN.test(
								item.frontierEvalFailure.message,
							)
								? "[redacted internal tool transcript]"
								: sanitizePublishedText(item.frontierEvalFailure.message),
						},
					}
				: {}),
		})),
	}) as RunResult;
}

/**
 * Converts a raw machine instance identifier into a deterministic published token.
 *
 * @param machineInstanceId - Raw machine instance identifier
 * @returns Stable scrubbed token
 */
function sanitizeMachineInstanceId(machineInstanceId: string): string {
	if (/^machine-[0-9a-f]{12}$/i.test(machineInstanceId)) {
		return machineInstanceId;
	}
	return `machine-${createHash("sha256").update(machineInstanceId).digest("hex").slice(0, 12)}`;
}

/**
 * Removes host-specific machine instance identifiers from aggregate payloads.
 *
 * @param aggregate - Aggregate payload to sanitize
 * @returns Aggregate payload safe for publication
 */
function sanitizePublishedAggregate(
	aggregate: LeaderboardAggregate,
): LeaderboardAggregate {
	return {
		...aggregate,
		items: aggregate.items.map((item) => ({
			...item,
			machineInstanceId: item.machineInstanceId
				? sanitizeMachineInstanceId(item.machineInstanceId)
				: undefined,
		})),
	};
}

/**
 * Removes host-specific details from a plan before publishing.
 *
 * @param plan - Parsed plan artifact
 * @returns Sanitized plan artifact
 */
function sanitizePublishedPlan(plan: RunPlan): RunPlan {
	const sanitizedPlan = sanitizePublishedValue(plan) as RunPlan;
	if (!sanitizedPlan.machine) {
		return sanitizedPlan;
	}

	return {
		...sanitizedPlan,
		machine: {
			...sanitizedPlan.machine,
			instanceId: sanitizeMachineInstanceId(sanitizedPlan.machine.instanceId),
			displayLabel: undefined,
		},
	};
}

/**
 * Verifies a Run Result is final enough to publish.
 *
 * @param run - Parsed run artifact
 * @throws {Error} When the run still contains pending/running items
 */
function assertPublishableRun(run: RunResult): void {
	const hasOpenItems =
		run.summary.pending > 0 ||
		run.summary.completed + run.summary.failed !== run.summary.total ||
		run.items.some(
			(item) => item.status === "pending" || item.status === "running",
		);
	if (hasOpenItems) {
		throw new Error(
			`Partial Run Result cannot be published: ${run.runId}. Finish or discard the partial run before building Published Runs.`,
		);
	}
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
	const runDirName = basename(runDir);
	const runContent = await readFile(runJsonPath, "utf-8").catch((error) => {
		throw new Error(
			`readRunBundle failed to read run.json for ${runDirName}: ${(error as Error).message}`,
		);
	});
	let run: RunResult;
	try {
		run = parseKnownRunPayload(JSON.parse(runContent) as unknown);
		assertPublishableRun(run);
		run = sanitizePublishedRun(run);
	} catch (error) {
		throw new Error(
			`readRunBundle failed to parse run.json for ${runDirName}: ${(error as Error).message}`,
		);
	}

	const planJsonPath = join(runDir, "plan.json");
	let plan: AggregateRunInput["plan"] | undefined;
	try {
		const planContent = await readFile(planJsonPath, "utf-8");
		try {
			plan = sanitizePublishedPlan(
				parseKnownPlanPayload(JSON.parse(planContent) as unknown),
			);
		} catch (error) {
			throw new Error(
				`readRunBundle failed to parse plan.json for ${runDirName}: ${(error as Error).message}`,
			);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		plan = undefined;
	}

	return {
		runDirName,
		run,
		...(plan ? { plan } : {}),
	};
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
				? {
						// Backward-compatible alias for older dashboard consumers.
						machineProfileId: metadata.machineProfileKey,
					}
				: {}),
			...(metadata.machineProfileLabel
				? { machineProfileLabel: metadata.machineProfileLabel }
				: {}),
			...((metadata.machineDisplayLabel ?? metadata.machineProfileLabel)
				? {
						machineLabel:
							metadata.machineDisplayLabel ?? metadata.machineProfileLabel,
					}
				: {}),
			...(metadata.machineInstanceId
				? {
						machineInstanceId: sanitizeMachineInstanceId(
							metadata.machineInstanceId,
						),
					}
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

	if (
		isSameOrNestedPath(sourceResultsDir, outputResultsDir) ||
		isSameOrNestedPath(outputResultsDir, sourceResultsDir)
	) {
		throw new Error(
			`Dashboard source and output directories must not overlap: source="${sourceResultsDir}" output="${outputResultsDir}"`,
		);
	}
	if (isSameOrNestedPath(sourceResultsDir, aggregatesDir)) {
		throw new Error(
			`Dashboard aggregates directory must not be inside the source results tree: source="${sourceResultsDir}" aggregates="${aggregatesDir}"`,
		);
	}

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
		schemaVersion: 3,
		generatedAt: new Date().toISOString(),
		latestCheckpointId,
		runs,
		checkpoints,
	};

	await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

	let aggregatesWritten = 0;
	for (const checkpoint of checkpoints) {
		const aggregate = sanitizePublishedAggregate(
			aggregateRunsForCheckpoint(
				bundles,
				checkpoint.checkpointId,
			) as LeaderboardAggregate,
		);
		await writeFile(
			join(aggregatesDir, `${checkpoint.checkpointId}.json`),
			JSON.stringify(aggregate, null, 2),
			"utf-8",
		);
		aggregatesWritten += 1;
	}

	const latestAggregate = sanitizePublishedAggregate(
		aggregateRunsForCheckpoint(
			bundles,
			latestCheckpointId,
		) as LeaderboardAggregate,
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
