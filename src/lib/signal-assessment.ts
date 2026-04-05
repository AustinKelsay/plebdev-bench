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

const INTERNAL_TOOL_TRANSCRIPT_PATTERNS = [
	/"sessionID"\s*:/i,
	/"type"\s*:\s*"step_(?:start|finish)"/i,
	/"type"\s*:\s*"tool_(?:call|result|use)"/i,
	/(?:^|\n)\s*\[Function\s+(?:bash|edit|glob|grep|read|write)\b/im,
	/(?:^|\n)\s*(?:bash|edit|glob|grep|read|write)\s*(?:\{|\()/im,
	/(?:^|\n)\s*(?:read|write)\s+(?:\/|~|\.)/im,
	/<function=(?:bash|edit|glob|grep|read|write)>/i,
	/<parameter=filePath>/i,
	/(?:^|\n)\s*(?:read|write)\s*\{[\s\S]*?\bfilePath\s*:/im,
] as const;

const AGENT_REQUESTED_INPUT_PATTERNS = [
	/\bwould you like me to continue\b/i,
	/\breached the maximum number of actions\b/i,
	/\bwithout user input\b/i,
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
	return INTERNAL_TOOL_TRANSCRIPT_PATTERNS.some((pattern) =>
		pattern.test(trimmed),
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
 */
export function finalizeItemSignalAssessment(input: {
	existing: SignalAssessment | undefined;
	automatedScore: AutomatedScore | undefined;
	rowFailed?: boolean;
	output: string | undefined;
}): SignalAssessment {
	let assessment = input.existing ?? createTrustworthySignalAssessment();
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
