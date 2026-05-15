/**
 * Purpose: OpenCode permission policy and permission-denial diagnostics.
 * Exports: OPENCODE_PERMISSION_POLICY, OpenCodePermissionPolicy,
 *          createOpenCodePermissionPolicy, isOpenCodePermissionDeniedText,
 *          getOpenCodePermissionTaintReasons
 *
 * Invariants:
 * - Default benchmark runs allow local workspace tools.
 * - External directory access and user-interaction tools are denied.
 * - Permission denials map to existing benchmark signal reason codes.
 */

import type { SignalAssessmentReason } from "../schemas/index.js";

/** Current OpenCode permission policy emitted into generated config. */
export const OPENCODE_PERMISSION_POLICY = {
	"*": "allow",
	external_directory: "deny",
	question: "deny",
	task: "deny",
	skill: "deny",
	webfetch: "deny",
	websearch: "deny",
	codesearch: "deny",
	lsp: "deny",
} as const;

/** Current OpenCode permission policy emitted into generated config. */
export type OpenCodePermissionPolicy = typeof OPENCODE_PERMISSION_POLICY;

const PERMISSION_DENIAL_PATTERN =
	/(?:\bpermission\b[^\r\n.;]{0,40}\b(?:denied|rejected)\b|\b(?:denied|rejected)\b[^\r\n.;]{0,40}\bpermission\b|\bpermission\b[^\r\n]{0,120}\bauto-?reject(?:ing|ed)?\b|\baccess\s+denied\b|\bexternal_directory\b[^\r\n.;]{0,80}\b(?:denied|rejected|auto-?reject(?:ing|ed)?)\b|\bexternal_directory\b[^\r\n]{0,120}\bauto-?reject(?:ing|ed)?\b)/i;

/**
 * Detects OpenCode permission-denial diagnostics in raw text.
 *
 * @param text - Raw OpenCode output or tool-error text
 * @returns True when text indicates a permission denial
 * @throws {never} Never throws; string input is matched without parsing
 */
export function isOpenCodePermissionDeniedText(text: string): boolean {
	return PERMISSION_DENIAL_PATTERN.test(text);
}

/**
 * Returns a fresh OpenCode permission policy for generated config.
 *
 * @returns Permission policy object safe to serialize into `opencode.json`
 * @throws {never} Never throws; the policy is cloned from a static literal
 */
export function createOpenCodePermissionPolicy(): OpenCodePermissionPolicy {
	return { ...OPENCODE_PERMISSION_POLICY };
}

/**
 * Detects permission-denial text and maps it to stable taint reasons.
 *
 * @param texts - Raw stdout/stderr/tool-error payloads to inspect
 * @returns Signal assessment reasons for permission-originated taint
 * @throws {never} Never throws; inputs are scanned as strings without parsing
 */
export function getOpenCodePermissionTaintReasons(
	...texts: readonly string[]
): SignalAssessmentReason[] {
	return texts.some((text) => isOpenCodePermissionDeniedText(text))
		? ["tool_permission_denied"]
		: [];
}
