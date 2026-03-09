/**
 * Purpose: Zod schemas for scoring specifications.
 * Exports: ExpectedExportSchema, ExpectedExport, TestCaseSchema, TestCase,
 *          WorkspaceFileAssertionSchema, WorkspaceFileAssertion,
 *          WorkspaceJsonAssertionSchema, WorkspaceJsonAssertion,
 *          WorkspaceMutationSetSchema, WorkspaceMutationSet,
 *          WorkspaceAssertionsSchema, WorkspaceAssertions,
 *          ScoringSpecSchema, ScoringSpec, TestCaseResultSchema,
 *          TestCaseResult, ScoringResultSchema, ScoringResult
 *
 * Scoring specs are data-driven test definitions that describe:
 * - Expected exports from generated code
 * - Test cases with inputs and expected outputs
 * - Workspace assertions for file-system driven tasks
 */

import { z } from "zod";
import {
	ScoringFailureTypeSchema,
	TestScoringModeSchema,
} from "./common.schema.js";

/**
 * Validates a workspace-relative file path.
 *
 * @param pathValue - Candidate relative path
 * @returns True when the path stays inside the workspace
 */
function isSafeWorkspacePath(pathValue: string): boolean {
	if (/^[A-Za-z]:\\/.test(pathValue) || pathValue.startsWith("/")) {
		return false;
	}
	return !pathValue.split(/[\\/]+/).includes("..");
}

/** Relative workspace path schema. */
const WorkspacePathSchema = z.string().min(1).refine(isSafeWorkspacePath, {
	message: "must be a relative path without '..' segments",
});

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

/** Exact text assertion for a workspace file. */
export const WorkspaceFileAssertionSchema = z.object({
	/** Relative path from workspace root. */
	path: WorkspacePathSchema,

	/** Exact expected file contents. */
	content: z.string(),
});

export type WorkspaceFileAssertion = z.infer<
	typeof WorkspaceFileAssertionSchema
>;

/** Exact JSON assertion for a workspace file. */
export const WorkspaceJsonAssertionSchema = z.object({
	/** Relative path from workspace root. */
	path: WorkspacePathSchema,

	/** Expected parsed JSON value. */
	value: z.unknown(),
});

export type WorkspaceJsonAssertion = z.infer<
	typeof WorkspaceJsonAssertionSchema
>;

/** Exact mutation sets allowed for a workspace task. */
export const WorkspaceMutationSetSchema = z.object({
	/** Relative file paths expected to be newly created. */
	created: z.array(WorkspacePathSchema).default([]),

	/** Relative file paths expected to be modified in place. */
	modified: z.array(WorkspacePathSchema).default([]),

	/** Relative file paths expected to be deleted. */
	deleted: z.array(WorkspacePathSchema).default([]),
});

export type WorkspaceMutationSet = z.infer<typeof WorkspaceMutationSetSchema>;

/** File-system assertions for workspace-scored tests. */
export const WorkspaceAssertionsSchema = z
	.object({
		/** Relative paths that must exist after task completion. */
		requiredPaths: z.array(WorkspacePathSchema).default([]),

		/** Relative paths that must be absent after task completion. */
		absentPaths: z.array(WorkspacePathSchema).default([]),

		/** Exact text file assertions. */
		files: z.array(WorkspaceFileAssertionSchema).default([]),

		/** Exact JSON file assertions. */
		jsonFiles: z.array(WorkspaceJsonAssertionSchema).default([]),

		/** Exact mutation set expected relative to the seeded workspace. */
		mutations: WorkspaceMutationSetSchema.default({
			created: [],
			modified: [],
			deleted: [],
		}),
	})
	.refine(
		(value) =>
			value.requiredPaths.length > 0 ||
			value.absentPaths.length > 0 ||
			value.files.length > 0 ||
			value.jsonFiles.length > 0 ||
			value.mutations.created.length > 0 ||
			value.mutations.modified.length > 0 ||
			value.mutations.deleted.length > 0,
		{
			message: "workspace assertions must define at least one check",
		},
	);

export type WorkspaceAssertions = z.infer<typeof WorkspaceAssertionsSchema>;

/**
 * Complete scoring specification for a benchmark test.
 */
export const ScoringSpecSchema = z
	.object({
		/** Schema version for scoring-spec migrations. */
		schemaVersion: z.number().int().positive().default(1),

		/** Test slug (must match directory name). */
		testSlug: z.string(),

		/** Scoring mode for this test. */
		mode: TestScoringModeSchema.default("code-module"),

		/** Expected exports that the generated code must provide. */
		expectedExports: z
			.array(z.union([z.string(), ExpectedExportSchema]))
			.default([]),

		/** Test cases to run against the generated code. */
		testCases: z.array(TestCaseSchema).default([]),

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

		/** Workspace assertions for filesystem-driven computer-use tests. */
		workspace: WorkspaceAssertionsSchema.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.mode === "workspace" && value.workspace === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["workspace"],
				message: 'workspace assertions are required when mode is "workspace"',
			});
		}
		if (
			value.mode === "code-module" &&
			value.expectedExports.length === 0 &&
			value.testCases.length === 0
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["expectedExports"],
				message:
					"code-module specs must define expectedExports, testCases, or both",
			});
		}
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

	/** Code extraction method used. 'file' indicates code was read from a file written by tool-calling harness. */
	extractionMethod: z
		.enum(["markdown-ts", "markdown-any", "heuristic", "raw", "file"])
		.optional(),

	/** Error if scoring failed entirely. */
	error: z.string().optional(),

	/** Failure type when error is present. */
	failureType: ScoringFailureTypeSchema.optional(),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;
