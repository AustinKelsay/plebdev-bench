/**
 * Purpose: Scoring specification for calculator-basic benchmark test.
 * Exports: spec
 *
 * Tests basic arithmetic operations: add, subtract, multiply, divide.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "calculator-basic",

	expectedExports: [
		{ name: "add", type: "function" },
		{ name: "subtract", type: "function" },
		{ name: "multiply", type: "function" },
		{ name: "divide", type: "function" },
	],

	testCases: [
		// Addition
		{ fn: "add", args: [2, 3], expected: 5, description: "add positive integers" },
		{ fn: "add", args: [-1, 1], expected: 0, description: "add with negative" },
		{ fn: "add", args: [0, 0], expected: 0, description: "add zeros" },
		{ fn: "add", args: [0.1, 0.2], expected: 0.3, tolerance: 0.0001, description: "add floats" },

		// Subtraction
		{ fn: "subtract", args: [10, 4], expected: 6, description: "subtract positive" },
		{ fn: "subtract", args: [5, 10], expected: -5, description: "subtract to negative" },
		{ fn: "subtract", args: [0, 0], expected: 0, description: "subtract zeros" },

		// Multiplication
		{ fn: "multiply", args: [3, 7], expected: 21, description: "multiply positive" },
		{ fn: "multiply", args: [-2, 5], expected: -10, description: "multiply with negative" },
		{ fn: "multiply", args: [0, 100], expected: 0, description: "multiply by zero" },
		{ fn: "multiply", args: [2.5, 4], expected: 10, description: "multiply floats" },

		// Division
		{ fn: "divide", args: [15, 3], expected: 5, description: "divide evenly" },
		{ fn: "divide", args: [10, 4], expected: 2.5, description: "divide with remainder" },
		{ fn: "divide", args: [-10, 2], expected: -5, description: "divide negative" },
		{ fn: "divide", args: [1, 0], expected: Infinity, description: "divide by zero" },
		{ fn: "divide", args: [0, 5], expected: 0, description: "zero divided" },
	],
};
