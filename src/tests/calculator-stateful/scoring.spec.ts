/**
 * Purpose: Scoring specification for calculator-stateful benchmark test.
 * Exports: spec
 *
 * Tests stateful calculator with method chaining and memory functions.
 * Uses factoryFn with freshInstancePerTest to ensure clean state.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "calculator-stateful",

	expectedExports: [{ name: "createCalculator", type: "function" }],

	factoryFn: "createCalculator",
	freshInstancePerTest: true,

	testCases: [
		// Initial state
		{ fn: "result", args: [], expected: 0, description: "initial value is 0" },

		// Basic operations (chainable - no expected value check)
		{ fn: "add", args: [5], description: "add returns calculator (chainable)" },
		{ fn: "result", args: [], expected: 5, description: "add modifies value" },

		// Subtraction (fresh instance)
		{ fn: "subtract", args: [3], description: "subtract returns calculator" },
		{ fn: "result", args: [], expected: -3, description: "subtract from 0" },

		// Multiplication (fresh instance)
		{ fn: "multiply", args: [4], description: "multiply returns calculator" },
		{ fn: "result", args: [], expected: 0, description: "0 * 4 = 0" },

		// Division (fresh instance)
		{ fn: "divide", args: [2], description: "divide returns calculator" },
		{ fn: "result", args: [], expected: 0, description: "0 / 2 = 0" },

		// Clear (fresh instance)
		{ fn: "clear", args: [], description: "clear returns calculator" },
		{ fn: "result", args: [], expected: 0, description: "clear resets to 0" },

		// Memory operations (fresh instance)
		{ fn: "memoryRecall", args: [], expected: 0, description: "initial memory is 0" },
		{ fn: "memoryStore", args: [], description: "memoryStore returns calculator" },
		{ fn: "memoryClear", args: [], description: "memoryClear returns calculator" },
		{ fn: "memoryAdd", args: [], description: "memoryAdd returns calculator" },
	],
};
