/**
 * Purpose: Validate test catalog discovery and category-based selection behavior.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	TEST_METADATA_FILE,
	discoverTestCatalog,
	selectTests,
} from "../src/lib/test-catalog.js";

const tempDirs: string[] = [];

/**
 * Creates a temporary project root for catalog tests.
 *
 * @returns Temporary root path
 */
function createTempRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "plebdev-bench-catalog-"));
	tempDirs.push(root);
	return root;
}

/**
 * Creates a test directory and optional metadata.
 *
 * @param root - Temporary project root
 * @param slug - Test slug
 * @param metadata - Metadata object to write
 */
function createTestDir(
	root: string,
	slug: string,
	metadata?: Record<string, unknown>,
): void {
	const dir = path.join(root, "src", "tests", slug);
	fs.mkdirSync(dir, { recursive: true });
	if (metadata) {
		fs.writeFileSync(
			path.join(dir, TEST_METADATA_FILE),
			JSON.stringify(metadata, null, 2),
		);
	}
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("discoverTestCatalog", () => {
	it("loads and sorts tests with valid metadata", () => {
		const root = createTempRoot();
		createTestDir(root, "zeta", {
			category: "coding",
			tags: ["z"],
			scoringMode: "code-module",
		});
		createTestDir(root, "alpha", {
			category: "computer-use",
			description: "A computer-use test",
			scoringMode: "workspace",
			requiresTools: true,
		});

		const catalog = discoverTestCatalog(root);
		expect(catalog.map((test) => test.slug)).toEqual(["alpha", "zeta"]);
		expect(catalog[0].category).toBe("computer-use");
		expect(catalog[0].scoringMode).toBe("workspace");
		expect(catalog[0].requiresTools).toBe(true);
		expect(catalog[1].tags).toEqual(["z"]);
	});

	it("throws when metadata file is missing", () => {
		const root = createTempRoot();
		createTestDir(root, "smoke");

		expect(() => discoverTestCatalog(root)).toThrow(TEST_METADATA_FILE);
	});
});

describe("selectTests", () => {
	it("throws on unknown requested tests", () => {
		const root = createTempRoot();
		createTestDir(root, "smoke", { category: "coding" });
		const catalog = discoverTestCatalog(root);

		expect(() => selectTests(catalog, ["does-not-exist"], [])).toThrow(
			"Unknown tests",
		);
	});

	it("applies category filters and keeps tool-smoke first", () => {
		const root = createTempRoot();
		createTestDir(root, "calculator-basic", { category: "coding" });
		createTestDir(root, "tool-smoke", { category: "coding" });
		createTestDir(root, "desktop-cleanup", { category: "computer-use" });
		const catalog = discoverTestCatalog(root);

		const codingOnly = selectTests(catalog, [], ["coding"]);
		expect(codingOnly.map((test) => test.slug)).toEqual([
			"tool-smoke",
			"calculator-basic",
		]);

		const computerUseOnly = selectTests(catalog, [], ["computer-use"]);
		expect(computerUseOnly.map((test) => test.slug)).toEqual([
			"desktop-cleanup",
		]);
	});
});
