/**
 * Purpose: Workspace scoring specification for workspace-reorg benchmark test.
 * Exports: spec
 *
 * Validates file moves, old-path cleanup, and manifest generation.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	schemaVersion: 1,
	testSlug: "workspace-reorg",
	mode: "workspace",
	expectedExports: [],
	testCases: [],
	workspace: {
		requiredPaths: [
			"docs/guides/install.md",
			"docs/index.json",
			"docs/reference/config.md",
			"docs/release-notes/changelog.md",
		],
		absentPaths: [
			"incoming/guides/install.md",
			"incoming/reference/config.md",
			"incoming/release-notes/changelog.md",
		],
		files: [
			{
				path: "docs/guides/install.md",
				content: "# Install\n\nRun `bun install` before benchmarking.\n",
			},
			{
				path: "docs/reference/config.md",
				content: "# Config\n\nSet `generateTimeoutMs` per run profile.\n",
			},
			{
				path: "docs/release-notes/changelog.md",
				content: "# Changelog\n\n- Added workspace benchmark coverage.\n",
			},
		],
		jsonFiles: [
			{
				path: "docs/index.json",
				value: {
					guides: ["docs/guides/install.md"],
					reference: ["docs/reference/config.md"],
					releaseNotes: ["docs/release-notes/changelog.md"],
				},
			},
		],
		mutations: {
			created: [
				"docs/guides/install.md",
				"docs/index.json",
				"docs/reference/config.md",
				"docs/release-notes/changelog.md",
			],
			modified: [],
			deleted: [
				"incoming/guides/install.md",
				"incoming/reference/config.md",
				"incoming/release-notes/changelog.md",
			],
		},
	},
};
