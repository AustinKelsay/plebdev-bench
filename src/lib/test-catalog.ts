/**
 * Purpose: Discover and filter benchmark tests with category metadata.
 * Exports: TEST_METADATA_FILE, discoverTestCatalog, selectTests, orderTests
 *
 * Invariants:
 * - Every test directory must include test.meta.json
 * - Metadata is validated at load boundaries with Zod
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { TOOL_SMOKE_TEST_SLUG } from "./tool-smoke.js";
import type { TestCategory, TestDefinition } from "../schemas/index.js";
import {
	TestDefinitionSchema,
	TestMetadataSchema,
} from "../schemas/index.js";

/** Required metadata filename in each test directory. */
export const TEST_METADATA_FILE = "test.meta.json";

/**
 * Discovers test definitions by scanning src/tests and loading metadata files.
 *
 * @param rootDir - Project root (defaults to process.cwd())
 * @returns Sorted test definitions
 *
 * @throws {Error} If tests directory is missing, empty, or contains invalid metadata
 */
export function discoverTestCatalog(rootDir: string = process.cwd()): TestDefinition[] {
	const testsDir = path.join(rootDir, "src", "tests");
	if (!fs.existsSync(testsDir)) {
		throw new Error(`Tests directory not found: ${testsDir}`);
	}

	const testDirs = fs
		.readdirSync(testsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	if (testDirs.length === 0) {
		throw new Error(`No tests found in ${testsDir}`);
	}

	return testDirs.map((slug) => {
		const metadataPath = path.join(testsDir, slug, TEST_METADATA_FILE);
		if (!fs.existsSync(metadataPath)) {
			throw new Error(
				`Missing ${TEST_METADATA_FILE} for test "${slug}": ${metadataPath}`,
			);
		}

		let raw: unknown;
		try {
			raw = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
		} catch (error) {
			throw new Error(
				`Invalid JSON in ${metadataPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const parsed = TestMetadataSchema.safeParse(raw);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((issue) => {
					const location = issue.path.length > 0 ? issue.path.join(".") : "<root>";
					return `${location}: ${issue.message}`;
				})
				.join("\n");
			throw new Error(`Invalid metadata in ${metadataPath}:\n${issues}`);
		}

		return TestDefinitionSchema.parse({
			slug,
			...parsed.data,
		});
	});
}

/**
 * Orders tests so tool-smoke runs first when present.
 *
 * @param tests - Input test definitions
 * @returns Ordered test definitions
 */
export function orderTests(tests: TestDefinition[]): TestDefinition[] {
	const toolSmoke = tests.find((test) => test.slug === TOOL_SMOKE_TEST_SLUG);
	if (!toolSmoke) {
		return tests;
	}
	return [
		toolSmoke,
		...tests.filter((test) => test.slug !== TOOL_SMOKE_TEST_SLUG),
	];
}

/**
 * Applies test slug/category filters and validates requested slugs.
 *
 * @param catalog - Full discovered test catalog
 * @param requestedSlugs - Optional explicit test slugs from config/CLI
 * @param requestedCategories - Optional category filter from config/CLI
 * @returns Selected test definitions with tool-smoke ordering applied
 *
 * @throws {Error} If requested tests are unknown or selection is empty
 */
export function selectTests(
	catalog: TestDefinition[],
	requestedSlugs: string[],
	requestedCategories: TestCategory[],
): TestDefinition[] {
	const bySlug = new Map(catalog.map((test) => [test.slug, test]));
	let selected = catalog;

	if (requestedSlugs.length > 0) {
		const unknown = requestedSlugs.filter((slug) => !bySlug.has(slug));
		if (unknown.length > 0) {
			const available = catalog.map((test) => test.slug).join(", ");
			throw new Error(
				`Unknown tests: ${unknown.join(", ")}. Available: ${available}`,
			);
		}

		selected = requestedSlugs.map((slug) => {
			// Safe due to unknown-slug validation above.
			return bySlug.get(slug)!;
		});
	}

	if (requestedCategories.length > 0) {
		selected = selected.filter((test) =>
			requestedCategories.includes(test.category),
		);
	}

	if (selected.length === 0) {
		if (requestedCategories.length > 0) {
			throw new Error(
				`No tests matched categories: ${requestedCategories.join(", ")}`,
			);
		}
		throw new Error("No tests selected");
	}

	return orderTests(selected);
}
