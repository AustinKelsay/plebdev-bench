/**
 * Purpose: Workspace scoring specification for targeted-edit benchmark test.
 * Exports: spec
 *
 * Validates one-file precision editing with no collateral workspace changes.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
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
					'export const appConfig = {\n  mode: "production",\n  retryLimit: 3,\n  syncEnabled: true,\n  logLevel: "info",\n};\n',
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
