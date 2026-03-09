/**
 * Purpose: Workspace scoring specification for safe-cleanup benchmark test.
 * Exports: spec
 *
 * Validates constrained deletions and exact audit logging.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "safe-cleanup",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: ["reports/cleanup-report.json"],
		absentPaths: [
			"build/tmp/app.tmp",
			"cache/session.cache",
			"logs/2026-01-01.log",
		],
		files: [],
		jsonFiles: [
			{
				path: "reports/cleanup-report.json",
				value: {
					deleted: [
						"build/tmp/app.tmp",
						"cache/session.cache",
						"logs/2026-01-01.log",
					],
					preservedCount: 3,
				},
			},
		],
		mutations: {
			created: ["reports/cleanup-report.json"],
			modified: [],
			deleted: [
				"build/tmp/app.tmp",
				"cache/session.cache",
				"logs/2026-01-01.log",
			],
		},
	},
};
