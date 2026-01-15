/**
 * Purpose: Zod schemas for scoring specifications.
 * Exports: TestCaseSchema, TestCase, ScoringSpecSchema, ScoringSpec
 *
 * Scoring specs are data-driven test definitions that describe:
 * - Expected exports from generated code
 * - Test cases with inputs and expected outputs
 */

import { z } from "zod";
import { ScoringFailureTypeSchema } from "./common.schema.js";

/**
 * Expected export from generated code.
 * Used to verify the module exports the required functions/classes.
 */
export const ExpectedExportSchema = z.object({
	/** Name of the export. */
	name: z.string(),

	/** Expected type: 'function', 'class', 'object', 'number', 'string'. */
	type: z.enum(["function", "class", "object", "number", "string"]).optional(),
});

export type ExpectedExport = z.infer<typeof ExpectedExportSchema>;

/**
 * A single test case for scoring.
 * Calls a function with args and compares result to expected.
 */
export const TestCaseSchema = z.object({
	/** Function or method name to call. */
	fn: z.string(),

	/** Arguments to pass to the function. */
	args: z.array(z.unknown()),

	/** Expected return value. If omitted, test passes if function doesn't throw. */
	expected: z.unknown().optional(),

	/** Tolerance for floating point comparisons. */
	tolerance: z.number().optional(),

	/** Description of what this test case validates. */
	description: z.string().optional(),

	/** For methods on objects: the setup code to run first. */
	setup: z.string().optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Complete scoring specification for a benchmark test.
 */
export const ScoringSpecSchema = z.object({
	/** Test slug (must match directory name). */
	testSlug: z.string(),

	/** Expected exports that the generated code must provide. */
	expectedExports: z.array(z.union([z.string(), ExpectedExportSchema])),

	/** Test cases to run against the generated code. */
	testCases: z.array(TestCaseSchema),

	/**
	 * Factory function name if the test requires creating an instance.
	 * e.g., 'createCalculator' or 'TodoApp'
	 */
	factoryFn: z.string().optional(),

	/**
	 * Whether test cases should run against a fresh instance each time.
	 * Default: false (reuse instance).
	 */
	freshInstancePerTest: z.boolean().optional(),
});

export type ScoringSpec = z.infer<typeof ScoringSpecSchema>;

/**
 * Result of running a single test case.
 */
export const TestCaseResultSchema = z.object({
	/** Test case description or index. */
	name: z.string(),

	/** Whether the test passed. */
	passed: z.boolean(),

	/** Expected value (for debugging). */
	expected: z.unknown().optional(),

	/** Actual value (for debugging). */
	actual: z.unknown().optional(),

	/** Error message if test threw. */
	error: z.string().optional(),
});

export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

/**
 * Complete scoring result for a matrix item.
 */
export const ScoringResultSchema = z.object({
	/** Number of tests passed. */
	passed: z.number(),

	/** Number of tests failed. */
	failed: z.number(),

	/** Total number of tests. */
	total: z.number(),

	/** Detailed results per test case. */
	details: z.array(TestCaseResultSchema).optional(),

	/** Code extraction method used. */
	extractionMethod: z
		.enum(["markdown-ts", "markdown-any", "heuristic", "raw"])
		.optional(),

	/** Error if scoring failed entirely. */
	error: z.string().optional(),

	/** Failure type when error is present. */
	failureType: ScoringFailureTypeSchema.optional(),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;
