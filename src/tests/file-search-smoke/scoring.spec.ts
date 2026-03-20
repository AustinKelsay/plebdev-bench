/**
 * Purpose: Workspace scoring specification for file-search-smoke preflight.
 * Exports: spec
 *
 * Validates basic workspace search plus exact report generation.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "file-search-smoke",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["reports/search-result.json"],
		absentPaths: [],
		files: [],
		jsonFiles: [
			{
				path: "reports/search-result.json",
				value: {
					source: "inputs/beta/info.txt",
					target: "needle-42",
				},
			},
		],
		mutations: {
			created: ["reports/search-result.json"],
			modified: [],
			deleted: [],
		},
	},
};
