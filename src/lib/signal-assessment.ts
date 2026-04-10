/**
 * Purpose: Helpers for per-item benchmark signal assessment and trusted-metric filtering.
 * Exports: createTrustworthySignalAssessment, createTaintedSignalAssessment,
 *          appendSignalAssessmentReasons, hasCompleteSignalAssessments, isTaintedItem,
 *          isConfirmationOnlyOutput, isLikelyToolCallPayload,
 *          isInternalToolTranscriptOutput, isAgentRequestedInputOutput,
 *          getTranscriptOrInputTaintReasons, finalizeItemSignalAssessment
 *
 * Invariants:
 * - New runs should emit a signal assessment for every row.
 * - Tainted rows always include at least one stable reason code.
 * - Trusted metrics are only valid when every row in a run has an assessment.
 */

import type {
	AutomatedScore,
	MatrixItemResult,
	SignalAssessment,
	SignalAssessmentReason,
} from "../schemas/index.js";

const INTERNAL_TOOL_TRANSCRIPT_WINDOW_CHARS = 200;

const INTERNAL_TOOL_SESSION_ID_PATTERN = /"sessionID"\s*:/i;
const INTERNAL_TOOL_EVENT_TYPE_PATTERN =
	/"type"\s*:\s*"(?:step_(?:start|finish)|tool_(?:call|result|use))"/i;
const INTERNAL_TOOL_FUNCTION_MARKER_PATTERN =
	/(?:\[Function\s+(?:bash|edit|glob|grep|read|write)\b|<function=(?:bash|edit|glob|grep|read|write)>)/i;
const INTERNAL_TOOL_FILE_PATH_MARKER_PATTERN =
	/(?:<parameter=filePath>|\bfilePath\s*:)/i;

const AGENT_REQUESTED_INPUT_PATTERNS = [
	/\bwould you like me to continue\b/i,
	/\breached the maximum number of actions(?:[\s\S]*?)\bwithout user input\b/i,
	/\b(?:assistant|agent)\s+(?:is\s+)?operating\s+without\s+user\s+input\b/i,
	/\bawaiting user input\b/i,
	/\bneed(?:ing)? user input\b/i,
	/\bplease confirm(?:\s+to\s+continue|\s+that\s+you\s+want\s+to\s+continue|\s+how\s+you(?:'d| would)\s+like\s+to\s+proceed)\b/i,
	/\bneed your confirmation\b/i,
] as const;

/**
 * Builds a trustworthy signal assessment.
 *
 * @returns Trustworthy assessment with no taint reasons
 */
export function createTrustworthySignalAssessment(): SignalAssessment {
	return {
		classification: "trustworthy",
		reasons: [],
	};
}

/**
 * Builds a tainted signal assessment from stable reasons.
 *
 * @param reasons - Taint reasons to record
 * @returns Tainted assessment
 * @throws {Error} When `reasons` is empty or deduplicates to no reasons. Message:
 * `createTaintedSignalAssessment called with empty reasons`
 */
export function createTaintedSignalAssessment(
	reasons: readonly SignalAssessmentReason[],
): SignalAssessment {
	const uniqueReasons = Array.from(new Set(reasons));
	if (uniqueReasons.length === 0) {
		throw new Error("createTaintedSignalAssessment called with empty reasons");
	}
	return {
		classification: "tainted",
		reasons: uniqueReasons,
	};
}

/**
 * Appends taint reasons to an assessment, preserving uniqueness.
 *
 * @param current - Existing assessment, if any
 * @param reasons - Reasons to append
 * @returns Updated assessment
 */
export function appendSignalAssessmentReasons(
	current: SignalAssessment | undefined,
	reasons: readonly SignalAssessmentReason[],
): SignalAssessment {
	if (reasons.length === 0) {
		return current ?? createTrustworthySignalAssessment();
	}
	const currentReasons = current?.classification === "tainted" ? current.reasons : [];
	return createTaintedSignalAssessment([...currentReasons, ...reasons]);
}

/**
 * Returns true when every row carries a signal assessment.
 *
 * @param results - Run rows
 * @returns True when trusted metrics can be computed
 */
export function hasCompleteSignalAssessments(
	results: readonly MatrixItemResult[],
): boolean {
	return results.length > 0 && results.every((result) => result.signalAssessment);
}

/**
 * Returns true when an item is explicitly tainted.
 *
 * @param item - Matrix item result
 * @returns True when classification is tainted
 */
export function isTaintedItem(item: MatrixItemResult): boolean {
	return item.signalAssessment?.classification === "tainted";
}

/**
 * Detects confirmation-only output such as "DONE".
 *
 * @param output - Raw generation output
 * @returns True when output is only a short confirmation
 */
export function isConfirmationOnlyOutput(output: string): boolean {
	const trimmed = output.trim();
	if (trimmed.length === 0 || trimmed.length > 64) {
		return false;
	}
	return /^(done|complete|completed|finished|ok|success)\.?$/i.test(trimmed);
}

/**
 * Detects raw tool-call payloads that indicate the model printed a tool call.
 *
 * @param output - Raw generation output
 * @returns True when output resembles an unevaluated tool call
 */
export function isLikelyToolCallPayload(output: string): boolean {
	const trimmed = output.trim();
	if (trimmed.length === 0 || !trimmed.startsWith("{")) {
		return false;
	}
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return false;
		}
		const record = parsed as Record<string, unknown>;
		return (
			(typeof record.tool === "string" &&
				(record.arguments !== undefined || record.args !== undefined)) ||
			(typeof record.name === "string" &&
				(record.arguments !== undefined || record.args !== undefined))
		);
	} catch {
		return false;
	}
}

/**
 * Returns a global regex copy so `matchAll` can scan every occurrence.
 *
 * @param pattern - Source regex
 * @returns Global regex preserving existing flags
 */
function toGlobalRegex(pattern: RegExp): RegExp {
	return new RegExp(
		pattern.source,
		pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
	);
}

/**
 * Returns true when `secondaryPattern` appears near any `primaryPattern` match.
 *
 * @param output - Candidate output text
 * @param primaryPattern - First required marker
 * @param secondaryPattern - Second required marker
 * @returns True when both markers occur in the same local window
 */
function hasNearbyPatternPair(
	output: string,
	primaryPattern: RegExp,
	secondaryPattern: RegExp,
): boolean {
	const secondaryMatcher = new RegExp(
		secondaryPattern.source,
		secondaryPattern.flags.replaceAll("g", ""),
	);
	for (const match of output.matchAll(toGlobalRegex(primaryPattern))) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		const windowStart = Math.max(
			0,
			start - INTERNAL_TOOL_TRANSCRIPT_WINDOW_CHARS,
		);
		const windowEnd = Math.min(
			output.length,
			end + INTERNAL_TOOL_TRANSCRIPT_WINDOW_CHARS,
		);
		if (secondaryMatcher.test(output.slice(windowStart, windowEnd))) {
			return true;
		}
	}
	return false;
}

/**
 * Detects structured JSON transcript markers rather than isolated token mentions.
 *
 * @param output - Candidate output text
 * @returns True when session and step/tool event markers appear together nearby
 */
function hasStructuredJsonTranscriptMarkers(output: string): boolean {
	return (
		hasNearbyPatternPair(
			output,
			INTERNAL_TOOL_SESSION_ID_PATTERN,
			INTERNAL_TOOL_EVENT_TYPE_PATTERN,
		) ||
		hasNearbyPatternPair(
			output,
			INTERNAL_TOOL_EVENT_TYPE_PATTERN,
			INTERNAL_TOOL_SESSION_ID_PATTERN,
		)
	);
}

/**
 * Detects tool transcript blocks that include both a tool marker and file-path marker.
 *
 * @param output - Candidate output text
 * @returns True when both markers co-occur in the same transcript block
 */
function hasToolInvocationTranscriptBlock(output: string): boolean {
	const blocks = output.split(/\n\s*\n/);
	return blocks.some((block) => {
		const trimmedBlock = block.trim();
		return (
			trimmedBlock.length > 0 &&
			INTERNAL_TOOL_FUNCTION_MARKER_PATTERN.test(trimmedBlock) &&
			INTERNAL_TOOL_FILE_PATH_MARKER_PATTERN.test(trimmedBlock)
		);
	});
}

/**
 * Detects raw harness protocol transcripts or internal tool chatter leaked to output.
 *
 * @param output - Raw generation output
 * @returns True when output resembles internal transport/tool transcript text
 */
export function isInternalToolTranscriptOutput(output: string): boolean {
	const trimmed = output.trim();
	if (trimmed.length === 0) {
		return false;
	}
	return (
		hasStructuredJsonTranscriptMarkers(trimmed) ||
		hasToolInvocationTranscriptBlock(trimmed)
	);
}

/**
 * Detects outputs where the agent is asking for user confirmation/input.
 *
 * @param output - Raw generation output
 * @returns True when output asks the user to continue or confirm
 */
export function isAgentRequestedInputOutput(output: string): boolean {
	const trimmed = output.trim();
	if (trimmed.length === 0) {
		return false;
	}
	return AGENT_REQUESTED_INPUT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Collects transcript/input-specific taint reasons for harness boundary output.
 *
 * @param output - Raw or normalized output text
 * @returns Stable taint reasons for non-semantic transcript/input leakage
 */
export function getTranscriptOrInputTaintReasons(
	output: string,
): SignalAssessmentReason[] {
	const reasons: SignalAssessmentReason[] = [];
	if (isInternalToolTranscriptOutput(output)) {
		reasons.push("internal_tool_transcript");
	}
	if (isAgentRequestedInputOutput(output)) {
		reasons.push("agent_requested_input");
	}
	return reasons;
}

/**
 * Finalizes per-item signal assessment after scoring.
 *
 * @param input - Row context used for post-scoring taint adjustments
 * @returns Finalized signal assessment
 * @throws {Error} When neither `rowFailed` nor `automatedScore` is provided
 */
export function finalizeItemSignalAssessment(input: {
	existing: SignalAssessment | undefined;
	automatedScore: AutomatedScore | undefined;
	rowFailed?: boolean;
	output: string | undefined;
}): SignalAssessment {
	let assessment = input.existing ?? createTrustworthySignalAssessment();
	if (input.rowFailed === undefined && input.automatedScore === undefined) {
		throw new Error(
			"finalizeItemSignalAssessment requires rowFailed or automatedScore",
		);
	}
	const rowFailed =
		input.rowFailed ?? Boolean(input.automatedScore && input.automatedScore.failed > 0);
	if (
		!rowFailed ||
		!input.output
	) {
		return assessment;
	}

	const reasons: SignalAssessmentReason[] = [];
	if (isConfirmationOnlyOutput(input.output)) {
		reasons.push("confirmation_without_artifact");
	}
	if (isLikelyToolCallPayload(input.output)) {
		reasons.push("tool_call_not_executed");
	}
	reasons.push(...getTranscriptOrInputTaintReasons(input.output));

	assessment = appendSignalAssessmentReasons(assessment, reasons);
	return assessment;
}
