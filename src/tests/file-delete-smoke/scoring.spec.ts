/**
 * Purpose: Workspace scoring specification for file-delete-smoke preflight.
 * Exports: spec
 *
 * Validates basic delete capability plus exact reporting.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "file-delete-smoke",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["reports/delete-result.json"],
		absentPaths: ["trash/obsolete.txt"],
		files: [],
		jsonFiles: [
			{
				path: "reports/delete-result.json",
				value: {
					deleted: ["trash/obsolete.txt"],
					remaining: ["notes/keep.txt"],
				},
			},
		],
		mutations: {
			created: ["reports/delete-result.json"],
			modified: [],
			deleted: ["trash/obsolete.txt"],
		},
	},
};
