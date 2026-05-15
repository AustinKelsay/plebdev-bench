/**
 * Purpose: Ensure workspace tests only require capabilities that their fixtures and scoring specs actually need.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadScoringSpec } from "../src/lib/scoring-spec.js";
import { discoverTestCatalog } from "../src/lib/test-catalog.js";

/**
 * Returns true when a created file path needs a parent directory that is absent from the fixture tree.
 *
 * @param testSlug - Workspace test slug
 * @param filePath - Relative file path created by the benchmark
 * @returns True when the fixture does not already contain the parent directory
 */
function requiresDirectoryCreation(
	testSlug: string,
	filePath: string,
): boolean {
	const parentDir = path.dirname(filePath);
	if (parentDir === ".") {
		return false;
	}

	const fixtureParentDir = path.join(
		process.cwd(),
		"src",
		"tests",
		testSlug,
		"fixtures",
		parentDir,
	);
	return !fs.existsSync(fixtureParentDir);
}

describe("workspace capability parity", () => {
	it("requires workspace-mkdir whenever created files rely on missing parent directories", async () => {
		const catalog = discoverTestCatalog().filter(
			(test) => test.scoringMode === "workspace",
		);

		for (const test of catalog) {
			const spec = await loadScoringSpec(test.slug);
			const createdPaths = spec.workspace?.mutations?.created ?? [];
			const needsMkdir = createdPaths.some((createdPath) =>
				requiresDirectoryCreation(test.slug, createdPath),
			);

			expect(
				test.requiredHarnessCapabilities.includes("workspace-mkdir"),
				`${test.slug} should ${needsMkdir ? "" : "not "}declare workspace-mkdir`,
			).toBe(needsMkdir);
		}
	});
});
