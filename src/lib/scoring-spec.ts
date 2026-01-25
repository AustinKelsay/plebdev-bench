/**
 * Purpose: Load and validate scoring specifications for benchmark tests.
 * Exports: loadScoringSpec, hasScoringSpec
 *
 * Each benchmark test has a scoring.spec.ts that defines:
 * - Expected exports from generated code
 * - Test cases to run against the code
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { ScoringSpecSchema, type ScoringSpec } from "../schemas/index.js";
import { logger } from "./logger.js";

/** Cache for loaded scoring specs. */
const specCache = new Map<string, ScoringSpec>();

/**
 * Gets the path to a test's scoring spec file.
 *
 * @param testSlug - Test directory name
 * @returns Path to scoring.spec.ts
 */
function getScoringSpecPath(testSlug: string): string {
	return path.join(process.cwd(), "src", "tests", testSlug, "scoring.spec.ts");
}

/**
 * Checks if a test has a scoring spec file.
 *
 * @param testSlug - Test directory name
 * @returns True if scoring.spec.ts exists
 */
export function hasScoringSpec(testSlug: string): boolean {
	const specPath = getScoringSpecPath(testSlug);
	return fs.existsSync(specPath);
}

/**
 * Loads and validates a scoring spec for a test.
 *
 * @param testSlug - Test directory name
 * @returns The validated scoring spec
 *
 * @throws {Error} If spec file not found or invalid
 *
 * @example
 * ```typescript
 * const spec = await loadScoringSpec("calculator-basic");
 * console.log(`${spec.testCases.length} test cases`);
 * ```
 */
export async function loadScoringSpec(testSlug: string): Promise<ScoringSpec> {
	// Check cache first
	const cached = specCache.get(testSlug);
	if (cached) {
		return cached;
	}

	const specPath = getScoringSpecPath(testSlug);

	if (!fs.existsSync(specPath)) {
		throw new Error(
			`Scoring spec not found for test "${testSlug}": ${specPath}`,
		);
	}

	try {
		// Dynamic import of the spec file
		const module = await import(specPath);

		if (!module.spec) {
			throw new Error(
				`Scoring spec file must export "spec": ${specPath}`,
			);
		}

		// Validate with Zod
		const parsed = ScoringSpecSchema.safeParse(module.spec);

		if (!parsed.success) {
			const errors = parsed.error.errors
				.map((e) => `  ${e.path.join(".")}: ${e.message}`)
				.join("\n");
			throw new Error(
				`Invalid scoring spec for "${testSlug}":\n${errors}`,
			);
		}

		// Verify testSlug matches
		if (parsed.data.testSlug !== testSlug) {
			logger.warn(
				{ expected: testSlug, actual: parsed.data.testSlug },
				"Scoring spec testSlug mismatch",
			);
		}

		// Cache and return
		specCache.set(testSlug, parsed.data);
		return parsed.data;
	} catch (error) {
		if (error instanceof Error && error.message.includes("Scoring spec")) {
			throw error;
		}
		throw new Error(
			`Failed to load scoring spec for "${testSlug}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Clears the scoring spec cache.
 * Useful for testing or when specs are modified.
 */
export function clearScoringSpecCache(): void {
	specCache.clear();
}

/**
 * Gets the rubric file path for a test (for frontier eval).
 *
 * @param testSlug - Test directory name
 * @returns Path to rubric.md or null if not found
 */
export function getRubricPath(testSlug: string): string | null {
	const rubricPath = path.join(
		process.cwd(),
		"src",
		"tests",
		testSlug,
		"rubric.md",
	);
	return fs.existsSync(rubricPath) ? rubricPath : null;
}

/**
 * Loads the rubric content for frontier eval.
 *
 * @param testSlug - Test directory name
 * @returns Rubric content or null if not found
 */
export function loadRubric(testSlug: string): string | null {
	const rubricPath = getRubricPath(testSlug);
	if (!rubricPath) {
		return null;
	}
	return fs.readFileSync(rubricPath, "utf-8");
}
