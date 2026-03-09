/**
 * Purpose: Workspace scoring specification for targeted-edit benchmark test.
 * Exports: spec
 *
 * Validates one-file precision editing with no collateral workspace changes.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "targeted-edit",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["src/app-config.ts"],
		absentPaths: [],
		files: [
			{
				path: "src/app-config.ts",
				content:
					'/**\n * Purpose: Targeted-edit benchmark application config fixture.\n * Exports: appConfig\n * Invariants:\n * - mode is a stable environment label for the fixture.\n * - retryLimit is a non-negative integer.\n * - syncEnabled remains boolean.\n * - logLevel stays within the accepted logging levels for this fixture.\n */\n\n/**\n * Static application config fixture with mode, retryLimit, syncEnabled, and logLevel fields.\n */\nexport const appConfig = {\n\tmode: "production",\n\tretryLimit: 3,\n\tsyncEnabled: true,\n\tlogLevel: "info",\n};\n',
			},
		],
		jsonFiles: [],
		mutations: {
			created: [],
			modified: ["src/app-config.ts"],
			deleted: [],
		},
	},
};
