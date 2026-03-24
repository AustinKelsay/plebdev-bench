/**
 * Purpose: Helpers for per-item benchmark signal assessment and trusted-metric filtering.
 * Exports: createTrustworthySignalAssessment, createTaintedSignalAssessment,
 *          appendSignalAssessmentReasons, hasCompleteSignalAssessments,
 *          isTaintedItem, isConfirmationOnlyOutput, isLikelyToolCallPayload,
 *          finalizeItemSignalAssessment
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
	TestScoringMode,
} from "../schemas/index.js";

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
 */
export function createTaintedSignalAssessment(
	reasons: readonly SignalAssessmentReason[],
): SignalAssessment {
	const uniqueReasons = Array.from(new Set(reasons));
	if (uniqueReasons.length === 0) {
		return createTrustworthySignalAssessment();
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
 * Finalizes per-item signal assessment after scoring.
 *
 * @param input - Row context used for post-scoring taint adjustments
 * @returns Finalized signal assessment
 */
export function finalizeItemSignalAssessment(input: {
	existing: SignalAssessment | undefined;
	scoringMode: TestScoringMode;
	automatedScore: AutomatedScore | undefined;
	output: string | undefined;
}): SignalAssessment {
	let assessment = input.existing ?? createTrustworthySignalAssessment();
	if (
		input.scoringMode !== "workspace" ||
		!input.output ||
		!input.automatedScore ||
		input.automatedScore.failed === 0
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

	assessment = appendSignalAssessmentReasons(assessment, reasons);
	return assessment;
}
