/**
 * Purpose: Tool-smoke test constants and helpers.
 * Exports: TOOL_SMOKE_TEST_SLUG, isToolSmokeTest, selectToolSmokePassType
 *
 * Invariants:
 * - Tool-smoke runs once per model+harness to validate tool usage.
 * - Only a single passType is used to minimize overhead.
 */

import type { PassType } from "../schemas/index.js";

/** Test slug used for tool-smoke preflight. */
export const TOOL_SMOKE_TEST_SLUG = "tool-smoke";

/**
 * Checks if a test slug is the tool-smoke test.
 *
 * @param testSlug - Test slug to check
 * @returns True if tool-smoke
 */
export function isToolSmokeTest(testSlug: string): boolean {
	return testSlug === TOOL_SMOKE_TEST_SLUG;
}

/**
 * Selects the pass type to use for tool-smoke.
 *
 * Prefers "blind" if present to match default passType ordering.
 *
 * @param passTypes - Configured pass types
 * @returns Selected pass type
 *
 * @throws {Error} If passTypes is empty
 */
export function selectToolSmokePassType(passTypes: PassType[]): PassType {
	if (!Array.isArray(passTypes) || passTypes.length === 0) {
		throw new Error("passTypes must include at least one entry");
	}
	return passTypes.includes("blind") ? "blind" : passTypes[0];
}
