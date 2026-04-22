/**
 * Purpose: OpenCode permission policy and permission-denial diagnostics.
 * Exports: OpenCodePermissionPolicy, createOpenCodePermissionPolicy,
 *          isOpenCodePermissionDeniedText, getOpenCodePermissionTaintReasons
 *
 * Invariants:
 * - Default benchmark runs allow local workspace tools.
 * - External directory access and user-interaction tools are denied.
 * - Permission denials map to existing benchmark signal reason codes.
 */

import type { SignalAssessmentReason } from "../schemas/index.js";

/** Current OpenCode permission policy emitted into generated config. */
export type OpenCodePermissionPolicy = {
	readonly "*": "allow";
	readonly external_directory: "deny";
	readonly question: "deny";
	readonly task: "deny";
	readonly skill: "deny";
	readonly webfetch: "deny";
	readonly websearch: "deny";
	readonly codesearch: "deny";
	readonly lsp: "deny";
};

const OPENCODE_PERMISSION_POLICY: OpenCodePermissionPolicy = {
	"*": "allow",
	external_directory: "deny",
	question: "deny",
	task: "deny",
	skill: "deny",
	webfetch: "deny",
	websearch: "deny",
	codesearch: "deny",
	lsp: "deny",
};

const PERMISSION_DENIAL_PATTERN =
	/(permission requested|auto-rejecting|external_directory|permission denied|permission.*rejected|rejected.*permission|access denied)/i;

/**
 * Detects OpenCode permission-denial diagnostics in raw text.
 *
 * @param text - Raw OpenCode output or tool-error text
 * @returns True when text indicates a permission denial
 */
export function isOpenCodePermissionDeniedText(text: string): boolean {
	return PERMISSION_DENIAL_PATTERN.test(text);
}

/**
 * Returns a fresh OpenCode permission policy for generated config.
 *
 * @returns Permission policy object safe to serialize into `opencode.json`
 */
export function createOpenCodePermissionPolicy(): OpenCodePermissionPolicy {
	return { ...OPENCODE_PERMISSION_POLICY };
}

/**
 * Detects permission-denial text and maps it to stable taint reasons.
 *
 * @param texts - Raw stdout/stderr/tool-error payloads to inspect
 * @returns Signal assessment reasons for permission-originated taint
 */
export function getOpenCodePermissionTaintReasons(
	...texts: readonly string[]
): SignalAssessmentReason[] {
	return texts.some((text) => isOpenCodePermissionDeniedText(text))
		? ["tool_permission_denied"]
		: [];
}
