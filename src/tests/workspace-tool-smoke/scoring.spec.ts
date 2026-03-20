/**
 * Purpose: Workspace scoring specification for workspace-tool-smoke preflight.
 * Exports: spec
 *
 * Validates baseline read/write workspace capability with exact mutations.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "workspace-tool-smoke",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["checklist/steps.txt", "reports/status.txt"],
		absentPaths: [],
		files: [
			{
				path: "checklist/steps.txt",
				content: "bootstrap\nprocessed\n",
			},
			{
				path: "reports/status.txt",
				content: "phase=queued\nstatus=processed\n",
			},
		],
		jsonFiles: [],
		mutations: {
			created: ["reports/status.txt"],
			modified: ["checklist/steps.txt"],
			deleted: [],
		},
	},
};
