/**
 * Purpose: Workspace scoring specification for workspace-smoke benchmark test.
 * Exports: spec
 *
 * Validates exact file creation, append behavior, and workspace mutation bounds.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "workspace-smoke",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: [
			"artifacts/summary.json",
			"checklist/steps.txt",
			"logs/session.log",
		],
		absentPaths: [],
		files: [
			{
				path: "checklist/steps.txt",
				content: "bootstrap\nverify-inputs\narchive-results\n",
			},
			{
				path: "logs/session.log",
				content: "session-started\nworkspace-smoke\n",
			},
		],
		jsonFiles: [
			{
				path: "artifacts/summary.json",
				value: {
					status: "ready",
					createdBy: "workspace-smoke",
					steps: 3,
				},
			},
		],
		mutations: {
			created: ["artifacts/summary.json", "logs/session.log"],
			modified: ["checklist/steps.txt"],
			deleted: [],
		},
	},
};
