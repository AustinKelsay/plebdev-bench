/**
 * Purpose: Sanitize and validate dashboard publication artifacts.
 * Exports: assertPublishableRun, sanitizeMachineInstanceId, sanitizePublishedAggregate, sanitizePublishedPlan, sanitizePublishedRun
 *
 * Invariants:
 * - Published artifacts must not expose host paths or internal tool transcripts.
 * - Partial run artifacts must not be publishable.
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { RunPlan, RunResult } from "../../../src/schemas/index.js";
import type { LeaderboardAggregate } from "../src/lib/types.js";

const PUBLIC_PATH_PATTERNS = [
	/(?:\/Users\/|\/home\/|\/root\/|\/workspace\/|\/workspaces\/|\/Volumes\/|\/mnt\/|\/private\/|\/var\/|\/tmp\/)[^\s"'`()<>]+/g,
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
	/THOUGHT:|"sessionID"|session_id:|"type":"tool_use"|"type":"step_start"|"type":"step_finish"|error parsing tool call:\s*raw=|review diff/i;

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
 * Converts a raw machine instance identifier into a deterministic published token.
 *
 * @param machineInstanceId - Raw machine instance identifier
 * @returns Stable scrubbed token
 */
export function sanitizeMachineInstanceId(machineInstanceId: string): string {
	if (/^machine-[0-9a-f]{12}$/i.test(machineInstanceId)) {
		return machineInstanceId;
	}
	return `machine-${createHash("sha256").update(machineInstanceId).digest("hex").slice(0, 12)}`;
}

/**
 * Removes host-specific details from a run before using it in published dashboard artifacts.
 *
 * @param run - Parsed run artifact
 * @returns Sanitized run artifact
 */
export function sanitizePublishedRun(run: RunResult): RunResult {
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
 * Removes host-specific details from aggregate payloads.
 *
 * @param aggregate - Aggregate payload to sanitize
 * @returns Aggregate payload safe for publication
 */
export function sanitizePublishedAggregate(
	aggregate: LeaderboardAggregate,
): LeaderboardAggregate {
	const sanitizedAggregate = sanitizePublishedValue(
		aggregate,
	) as LeaderboardAggregate;
	return {
		...sanitizedAggregate,
		items: sanitizedAggregate.items.map((item) => ({
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
export function sanitizePublishedPlan(plan: RunPlan): RunPlan {
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
 * @throws {Error} When summary counters do not match item statuses or the run still contains pending/running items
 */
export function assertPublishableRun(run: RunResult): void {
	const actual = { completed: 0, failed: 0, pending: 0, running: 0 };
	for (const item of run.items) {
		actual[item.status] += 1;
	}
	const hasInconsistentSummary =
		run.summary.total !== run.items.length ||
		run.summary.completed !== actual.completed ||
		run.summary.failed !== actual.failed ||
		run.summary.pending !== actual.pending;
	if (hasInconsistentSummary || actual.pending > 0 || actual.running > 0) {
		throw new Error(
			`Partial Run Result cannot be published: ${run.runId}. Summary counters must match item statuses and all items must be final before building Published Runs.`,
		);
	}
}
