/**
 * Purpose: Scoring specification for smoke benchmark test.
 * Exports: spec
 *
 * Simple test: verify an `add` function that sums two numbers.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "smoke",

	expectedExports: [{ name: "add", type: "function" }],

	testCases: [
		{ fn: "add", args: [2, 3], expected: 5, description: "add positive integers" },
		{ fn: "add", args: [0, 0], expected: 0, description: "add zeros" },
		{ fn: "add", args: [-1, 1], expected: 0, description: "add with negative" },
		{ fn: "add", args: [10, -5], expected: 5, description: "add positive and negative" },
		{ fn: "add", args: [0.1, 0.2], expected: 0.3, tolerance: 0.0001, description: "add floats" },
	],
};
