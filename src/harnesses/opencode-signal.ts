/**
 * Purpose: OpenCode process-output selection and signal-assessment helpers.
 * Exports: selectProcessOutput, buildSignalAssessment,
 *          buildFailureSignalAssessment, buildOpenCodeFailure
 *
 * Invariants:
 * - Stream selection prefers parseable OpenCode protocol output.
 * - Signal assessments preserve transcript and permission-denial taint evidence.
 */

import {
	appendSignalAssessmentReasons,
	getTranscriptOrInputTaintReasons,
} from "../lib/signal-assessment.js";
import type {
	SignalAssessment,
	SignalAssessmentReason,
} from "../schemas/index.js";
import {
	type OpenCodeParsedEvents,
	parseOpenCodeEvents,
} from "./opencode-events.js";
import { getOpenCodePermissionTaintReasons } from "./opencode-permissions.js";

const MIN_OUTPUT_LENGTH = 10;

/** Scores whether process output contains parseable OpenCode event content. */
function scoreOpenCodeProcessStream(stream: string): number {
	const trimmed = stream.trim();
	if (trimmed.length === 0) {
		return 0;
	}
	const parsed = parseOpenCodeEvents(trimmed);
	if (parsed.hasProtocolEvents && parsed.output.trim().length > 0) {
		return 3;
	}
	if (parsed.hasProtocolEvents) {
		return 2;
	}
	if (parsed.method === "tool_call" && parsed.output.trim().length > 0) {
		return 1;
	}
	return 0;
}

/**
 * Chooses the best process output stream for downstream parsing.
 *
 * @param stdout - Captured OpenCode stdout
 * @param stderr - Captured OpenCode stderr
 * @returns Selected process text for OpenCode event parsing
 * @throws {never} This helper only selects between provided strings
 */
export function selectProcessOutput(stdout: string, stderr: string): string {
	const stdoutScore = scoreOpenCodeProcessStream(stdout);
	const stderrScore = scoreOpenCodeProcessStream(stderr);
	if (stderrScore > stdoutScore) {
		return stderr;
	}
	if (stdoutScore > 0 || stdout.trim().length > 0) {
		return stdout;
	}
	return stderr.trim().length >= MIN_OUTPUT_LENGTH ? stderr : stdout;
}

/**
 * Builds taint evidence from parsed OpenCode output plus raw process streams.
 *
 * @param parsed - Parsed OpenCode protocol output and diagnostics
 * @param stdout - Raw stdout captured from the OpenCode process
 * @param stderr - Raw stderr captured from the OpenCode process
 * @param parsedStream - Exact stream passed into the OpenCode parser
 * @param extraReasons - Additional stable taint reasons to append
 * @returns Signal assessment when any taint reason is present, otherwise undefined
 * @throws {never} This helper only aggregates stable taint reasons
 */
export function buildSignalAssessment(
	parsed: OpenCodeParsedEvents,
	stdout: string,
	stderr: string,
	parsedStream: string,
	extraReasons: readonly SignalAssessmentReason[] = [],
): SignalAssessment | undefined {
	const stderrReasons = getTranscriptOrInputTaintReasons(stderr, {
		source: "harness",
	}).filter((reason) => reason !== "internal_tool_transcript");
	const protocolOnlyReasons =
		parsed.method === "json" && parsed.output.trim().length === 0
			? getTranscriptOrInputTaintReasons(parsedStream, { source: "harness" })
			: [];
	const permissionReasons = [
		...getOpenCodePermissionTaintReasons(
			stdout,
			stderr,
			parsed.toolErrorText ?? "",
		),
		...(parsed.permissionDenied ? (["tool_permission_denied"] as const) : []),
	];
	const reasons = Array.from(
		new Set([
			...stderrReasons,
			...getTranscriptOrInputTaintReasons(parsed.output, {
				source: "artifact",
			}),
			...protocolOnlyReasons,
			...permissionReasons,
			...extraReasons,
		]),
	);
	return reasons.length > 0
		? appendSignalAssessmentReasons(undefined, reasons)
		: undefined;
}

/**
 * Builds failure-path taint evidence from raw process output.
 *
 * @param stdout - Raw stdout captured before failure
 * @param stderr - Raw stderr captured before failure
 * @returns Signal assessment summarizing failure-path taint evidence
 * @throws {never} This helper only aggregates stable taint reasons
 */
export function buildFailureSignalAssessment(
	stdout: string,
	stderr: string,
): SignalAssessment {
	const reasons = Array.from(
		new Set([
			...getTranscriptOrInputTaintReasons(stdout),
			...getTranscriptOrInputTaintReasons(stderr, { source: "harness" }),
			...getOpenCodePermissionTaintReasons(stdout, stderr, ""),
		]),
	);
	return appendSignalAssessmentReasons(undefined, reasons);
}

/**
 * Builds an Error carrying structured OpenCode failure evidence.
 *
 * @param message - User-facing failure message
 * @param durationMs - Measured command duration in milliseconds
 * @param output - Raw or parsed output payload to attach when present
 * @param signalAssessment - Optional taint evidence to attach
 * @returns Error instance enriched with runner-facing metadata
 * @throws {never} This helper only constructs an Error object
 */
export function buildOpenCodeFailure(
	message: string,
	durationMs: number,
	output: string,
	signalAssessment: SignalAssessment | undefined,
): Error {
	return Object.assign(new Error(message), {
		durationMs,
		...(output.trim().length > 0 ? { output } : {}),
		...(signalAssessment ? { signalAssessment } : {}),
	});
}
