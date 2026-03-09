/**
 * Purpose: Zod schemas for test catalog metadata.
 * Exports: TestMetadataSchema, TestMetadata, TestDefinitionSchema, TestDefinition
 *
 * Test metadata is loaded from src/tests/<slug>/test.meta.json.
 */

import { z } from "zod";
import { TestCategorySchema, TestScoringModeSchema } from "./common.schema.js";

/**
 * Applies shared invariants for test metadata.
 *
 * @param value - Metadata candidate
 * @param ctx - Zod refinement context
 */
function validateTestMetadata(
	value: { scoringMode: "code-module" | "workspace"; requiresTools: boolean },
	ctx: z.RefinementCtx,
): void {
	if (value.scoringMode === "workspace" && value.requiresTools !== true) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["requiresTools"],
			message: 'requiresTools must be true when scoringMode is "workspace"',
		});
	}
}

/** Base object schema shared by raw metadata and resolved definitions. */
const TestMetadataFieldsSchema = z.object({
	/** Schema version for metadata evolution. */
	schemaVersion: z.literal(1).default(1),

	/** Category used for test selection and reporting. */
	category: TestCategorySchema,

	/** Optional short human-readable description. */
	description: z.string().min(1).optional(),

	/** Optional tags for future filtering/grouping. */
	tags: z.array(z.string().min(1)).default([]),

	/** Scoring mode for this test. */
	scoringMode: TestScoringModeSchema.default("code-module"),

	/** Whether this test requires a tool-calling harness. */
	requiresTools: z.boolean().default(false),
});

/** Zod schema for per-test metadata file contents. */
export const TestMetadataSchema =
	TestMetadataFieldsSchema.superRefine(validateTestMetadata);

/** Test metadata type loaded from test.meta.json. */
export type TestMetadata = z.infer<typeof TestMetadataSchema>;

/** Zod schema for resolved test definitions used by the planner. */
export const TestDefinitionSchema = TestMetadataFieldsSchema.extend({
	/** Test slug (directory name). */
	slug: z.string().min(1),
}).superRefine(validateTestMetadata);

/** Resolved test definition used by the planner. */
export type TestDefinition = z.infer<typeof TestDefinitionSchema>;
