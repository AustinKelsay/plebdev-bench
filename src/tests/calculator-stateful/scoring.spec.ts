/**
 * Purpose: Scoring specification for calculator-stateful benchmark test.
 * Exports: spec
 *
 * Tests stateful calculator with method chaining and memory functions.
 * Uses a single instance to validate stateful behavior.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "calculator-stateful",

	expectedExports: [{ name: "createCalculator", type: "function" }],

	factoryFn: "createCalculator",

	testCases: [
		// Initial state
		{ fn: "result", args: [], expected: 0, description: "initial value is 0" },

		// Basic operations (chainable - no expected value check)
		{ fn: "add", args: [5], description: "add returns calculator (chainable)" },
		{ fn: "result", args: [], expected: 5, description: "add modifies value" },
		{ fn: "subtract", args: [3], description: "subtract returns calculator" },
		{ fn: "result", args: [], expected: 2, description: "subtract modifies value" },
		{ fn: "multiply", args: [4], description: "multiply returns calculator" },
		{ fn: "result", args: [], expected: 8, description: "multiply modifies value" },
		{ fn: "divide", args: [2], description: "divide returns calculator" },
		{ fn: "result", args: [], expected: 4, description: "divide modifies value" },

		// Clear resets current value
		{ fn: "clear", args: [], description: "clear returns calculator" },
		{ fn: "result", args: [], expected: 0, description: "clear resets to 0" },

		// Memory operations
		{ fn: "memoryRecall", args: [], expected: 0, description: "initial memory is 0" },
		{ fn: "add", args: [10], description: "add for memory store" },
		{ fn: "memoryStore", args: [], description: "memoryStore returns calculator" },
		{ fn: "clear", args: [], description: "clear after memory store" },
		{ fn: "memoryRecall", args: [], expected: 10, description: "memory persists after clear" },
		{ fn: "add", args: [5], description: "add for memory add" },
		{ fn: "memoryAdd", args: [], description: "memoryAdd returns calculator" },
		{ fn: "memoryRecall", args: [], expected: 15, description: "memoryAdd updates memory" },
		{ fn: "result", args: [], expected: 5, description: "memoryAdd does not change current value" },
		{ fn: "memoryClear", args: [], description: "memoryClear returns calculator" },
		{ fn: "memoryRecall", args: [], expected: 0, description: "memory cleared to 0" },
	],
};
