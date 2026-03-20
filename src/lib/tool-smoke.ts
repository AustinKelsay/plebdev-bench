/**
 * Purpose: Preflight benchmark constants and helpers.
 * Exports: PREFLIGHT_TEST_TAG, isPreflightTest, selectPreflightPassType,
 *          TOOL_SMOKE_TEST_SLUG
 *
 * Invariants:
 * - Preflight tests run once per model+harness to validate core harness behavior.
 * - Only a single passType is used to minimize overhead.
 */

import type { PassType } from "../schemas/index.js";

/** Tag used to identify preflight tests in metadata and run plans. */
export const PREFLIGHT_TEST_TAG = "preflight";

/** Test slug used for tool-smoke preflight. */
export const TOOL_SMOKE_TEST_SLUG = "tool-smoke";

/**
 * Checks if a test is marked as a preflight test.
 *
 * @param tags - Test tags
 * @returns True when the test is a preflight
 */
export function isPreflightTest(tags: readonly string[]): boolean {
	return tags.includes(PREFLIGHT_TEST_TAG);
}

/**
 * Selects the pass type to use for preflight tests.
 *
 * Prefers "blind" if present to match default passType ordering.
 *
 * @param passTypes - Configured pass types
 * @returns Selected pass type
 *
 * @throws {Error} If passTypes is empty
 */
export function selectPreflightPassType(passTypes: PassType[]): PassType {
	if (!Array.isArray(passTypes) || passTypes.length === 0) {
		throw new Error("passTypes must include at least one entry");
	}
	return passTypes.includes("blind") ? "blind" : passTypes[0];
}
