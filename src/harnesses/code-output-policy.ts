/**
 * Purpose: Shared prompt/output policy for tool-calling harness adapters.
 * Exports: buildCodeOnlyPrompt, evaluateCodeOnlyOutput, appendRetryMarker, hasRetryMarker, stripRetryMarker
 *
 * Invariants:
 * - Retry marker is adapter-internal and never sent to the model
 * - "retry once" behavior is controlled by marker presence
 * - Off-task/non-code outputs are explicitly identified for retry
 */

import { type ExtractedCode, extractCode } from "../lib/code-extractor.js";
import type { SignalAssessmentReason } from "../schemas/index.js";

/** Internal marker used to prevent infinite retry loops across recursive adapter calls. */
const RETRY_MARKER = "[PLEBDEV_BENCH_CODE_ONLY_RETRY_ONCE]";

/** Patterns that indicate status chatter instead of code output. */
const OFF_TASK_PATTERNS = [
	/\blet me know how i can help\b/i,
	/\bwould you like me to continue\b/i,
	/\bno todos? found\b/i,
	/\bno todo comments?\b/i,
	/\brepository .* no todo/i,
	/\bexplore the directory structure\b/i,
	/\bthis repo has no todo comments\b/i,
] as const;

/** Patterns indicating Goose hit headless turn/input limits and asked for confirmation. */
const TURN_LIMIT_PATTERNS = [
	/\breached the maximum number of actions\b/i,
	/\bwithout user input\b/i,
] as const;

/** Minimal code-like signals for accepting raw (non-extracted) text. */
const RAW_CODE_SIGNAL_PATTERNS = [
	/(^|\n)\s*(export\s+)?(async\s+)?function\b/,
	/(^|\n)\s*(export\s+)?(const|let|var)\b/,
	/(^|\n)\s*(export\s+)?(interface|type|class)\b/,
	/\=\>/,
	/[{}]/,
] as const;

/** Decision returned when classifying harness text output. */
export interface CodeOnlyOutputDecision {
	/** True when adapter should retry once with stricter prompt wording. */
	shouldRetry: boolean;
	/** Stable reason code for logs. */
	reason:
		| "ok"
		| "too_short"
		| "turn_limit"
		| "off_task"
		| "no_code_detected"
		| "suspicious_code_pattern";
	/** Extracted or raw code candidate to persist. */
	code: string;
	/** Extraction method used by code extractor. */
	method: ExtractedCode["method"];
	/** Taint reasons when the accepted output violated the strict code-only contract. */
	taintReasons: SignalAssessmentReason[];
}

/**
 * Builds the strict code-only prompt contract.
 *
 * @param prompt - Base task prompt
 * @param isRetry - Whether this is the retry attempt
 * @returns Prompt text with strict output contract appended
 */
export function buildCodeOnlyPrompt(prompt: string, isRetry: boolean): string {
	const retryLine = isRetry
		? "Previous output was unusable. Retry now and output only final TypeScript source."
		: "";
	const testSpecificLines = getTestSpecificContract(prompt);
	return [
		prompt.trim(),
		"",
		"Output contract:",
		"- Return only final TypeScript source code.",
		"- Do not include markdown fences, analysis, status messages, or repository exploration text.",
		"- Never ask for user input, confirmation, approval, or whether to continue.",
		"- If uncertain, still return your best complete TypeScript implementation.",
		...testSpecificLines,
		retryLine,
	]
		.filter((line) => line.length > 0)
		.join("\n");
}

/**
 * Adds strict test-specific constraints for prompts known to be flaky.
 *
 * @param prompt - Full task prompt
 * @returns Additional contract lines
 */
function getTestSpecificContract(prompt: string): string[] {
	const normalized = prompt.toLowerCase();
	const lines: string[] = [];
	if (normalized.includes("createtodoapp")) {
		lines.push(
			"- For todo-app: export `createTodoApp` and return all required methods exactly.",
			"- Keep all todo state inside `createTodoApp`; do not use module-level id/todo variables.",
			"- Do not reassign `const` arrays or rely on discarded `filter(...)` results.",
			"- `clearCompleted` must remove all completed items without mutating while iterating.",
		);
	}
	if (normalized.includes("createcalculator")) {
		lines.push(
			"- For calculator-stateful: `memoryRecall()` must return memory and must not mutate current calculator value.",
			"- Keep memory state independent from current result state.",
		);
	}
	return lines;
}

/** Regex for a single markdown code block with no surrounding prose. */
const SINGLE_CODE_BLOCK_REGEX =
	/^```(?:typescript|ts|javascript|js)?\n([\s\S]*?)\n?```$/;

/**
 * Determines taint reasons for accepted code-only output.
 *
 * @param rawOutput - Raw harness text output
 * @param extracted - Extracted code candidate
 * @returns Stable taint reasons
 */
function getAcceptedOutputTaintReasons(
	rawOutput: string,
	extracted: ExtractedCode,
): SignalAssessmentReason[] {
	const trimmed = rawOutput.trim();
	const normalizedCode = extracted.code.trim();
	if (trimmed === normalizedCode) {
		return [];
	}

	if (extracted.method === "raw") {
		const codeBlockMatch = trimmed.match(SINGLE_CODE_BLOCK_REGEX);
		if (codeBlockMatch?.[1]?.trim() === normalizedCode) {
			return ["output_contract_violation"];
		}
		return ["mixed_prose_salvaged"];
	}

	if (SINGLE_CODE_BLOCK_REGEX.test(trimmed)) {
		return ["output_contract_violation"];
	}

	return ["mixed_prose_salvaged"];
}

/**
 * Evaluates whether an output is usable code or should trigger a retry.
 *
 * @param output - Harness text output
 * @param minOutputLength - Minimum usable length
 * @returns Decision describing retry behavior and extracted code candidate
 */
export function evaluateCodeOnlyOutput(
	output: string,
	minOutputLength: number,
): CodeOnlyOutputDecision {
	const trimmed = output.trim();
	if (trimmed.length < minOutputLength) {
		return {
			shouldRetry: true,
			reason: "too_short",
			code: trimmed,
			method: "raw",
			taintReasons: [],
		};
	}

	const extracted = extractCode(trimmed);
	const code = extracted.code.trim();
	const candidateCode = extracted.method === "raw" ? trimmed : code;
	if (
		hasSuspiciousTodoPatterns(candidateCode) ||
		hasSuspiciousCalculatorPatterns(candidateCode)
	) {
		return {
			shouldRetry: true,
			reason: "suspicious_code_pattern",
			code: candidateCode,
			method: extracted.method,
			taintReasons: [],
		};
	}

	if (extracted.method !== "raw" && code.length >= minOutputLength) {
		return {
			shouldRetry: false,
			reason: "ok",
			code,
			method: extracted.method,
			taintReasons: getAcceptedOutputTaintReasons(trimmed, extracted),
		};
	}

	const isTurnLimit = TURN_LIMIT_PATTERNS.some((pattern) =>
		pattern.test(trimmed),
	);
	if (isTurnLimit) {
		return {
			shouldRetry: true,
			reason: "turn_limit",
			code,
			method: extracted.method,
			taintReasons: [],
		};
	}

	const isOffTask = OFF_TASK_PATTERNS.some((pattern) => pattern.test(trimmed));
	if (isOffTask) {
		return {
			shouldRetry: true,
			reason: "off_task",
			code,
			method: extracted.method,
			taintReasons: [],
		};
	}

	const hasRawCodeSignals = RAW_CODE_SIGNAL_PATTERNS.some((pattern) =>
		pattern.test(trimmed),
	);
	if (hasRawCodeSignals) {
		return {
			shouldRetry: false,
			reason: "ok",
			code: candidateCode,
			method: extracted.method,
			taintReasons: getAcceptedOutputTaintReasons(trimmed, extracted),
		};
	}

	return {
		shouldRetry: true,
		reason: "no_code_detected",
		code,
		method: extracted.method,
		taintReasons: [],
	};
}

/**
 * Detects suspicious todo-app code patterns that frequently cause import/runtime failures.
 *
 * @param code - Candidate code to inspect
 * @returns True if suspicious pattern is present
 */
function hasSuspiciousTodoPatterns(code: string): boolean {
	if (!code.toLowerCase().includes("createtodoapp")) {
		return false;
	}
	const createTodoIdx = code.toLowerCase().indexOf("createtodoapp");
	const prefix = createTodoIdx >= 0 ? code.slice(0, createTodoIdx) : "";
	const suspiciousPatterns = [
		/\b(?:let|const|var)\s+(?:nextId|currentId)\b/m,
		/\bconst\s+todos\s*:\s*[^;\n]+;\s*[\s\S]{0,1200}\btodos\s*=\s*/m,
		/^\s*todos\.filter\([^;]*\);\s*$/m,
		/\btodos\.length\s*=\s*initialLength\s*-\s*todos\.length\b/m,
		/\btodos\.length\s*=\s*todos\.filter\([^)]*\)\.length\b/m,
		/\bclearCompleted\s*\([^)]*\)\s*{[\s\S]{0,500}\.forEach\([\s\S]{0,250}\.splice\(/m,
	] as const;
	const hasGlobalIdBeforeFactory =
		createTodoIdx > 0 && suspiciousPatterns[0].test(prefix);
	return (
		hasGlobalIdBeforeFactory ||
		suspiciousPatterns.slice(1).some((pattern) => pattern.test(code))
	);
}

/**
 * Detects suspicious calculator-stateful patterns that frequently fail rubric checks.
 *
 * @param code - Candidate code to inspect
 * @returns True if suspicious pattern is present
 */
function hasSuspiciousCalculatorPatterns(code: string): boolean {
	if (!code.toLowerCase().includes("createcalculator")) {
		return false;
	}
	const suspiciousPatterns = [
		/\bmemoryRecall\s*\([^)]*\)\s*(?::\s*[^({]+)?\s*{[\s\S]{0,300}\b(?:current|currentValue|value)\s*=\s*(?:memory|memoryValue)\b/m,
	] as const;
	return suspiciousPatterns.some((pattern) => pattern.test(code));
}

/**
 * Checks whether a prompt already carries the retry marker.
 *
 * @param prompt - Prompt text
 * @returns True when the prompt includes the internal retry marker
 */
export function hasRetryMarker(prompt: string): boolean {
	return prompt.includes(RETRY_MARKER);
}

/**
 * Appends the retry marker to a prompt.
 *
 * @param prompt - Prompt text
 * @returns Prompt text with marker appended
 */
export function appendRetryMarker(prompt: string): string {
	return `${stripRetryMarker(prompt)}\n${RETRY_MARKER}`;
}

/**
 * Removes internal retry marker from prompt text before sending to model.
 *
 * @param prompt - Prompt text
 * @returns Prompt without internal retry marker
 */
export function stripRetryMarker(prompt: string): string {
	return prompt.replaceAll(RETRY_MARKER, "").trim();
}
