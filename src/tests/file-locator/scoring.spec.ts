/**
 * Purpose: Workspace scoring specification for file-locator benchmark test.
 * Exports: spec
 *
 * Validates search accuracy and exact report generation without collateral edits.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "file-locator",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["reports/found-values.json"],
		absentPaths: [],
		files: [],
		jsonFiles: [
			{
				path: "reports/found-values.json",
				value: {
					owner: "samira",
					sourceCount: 3,
					ticket: "ALPHA-17",
					version: "3.4.1",
				},
			},
		],
		mutations: {
			created: ["reports/found-values.json"],
			modified: [],
			deleted: [],
		},
	},
};
