/**
 * Purpose: In-process scoring engine for generated code against test scoring specs.
 * Exports: scoreGenerationInProcess
 *
 * This module contains the original in-process scoring logic and is shared by:
 * - Main process fallback mode
 * - Dedicated scorer worker process (default path)
 *
 * Invariants:
 * - Never throws for normal scoring failures; returns structured ScoringResult errors
 * - Throws only for programmer/setup errors outside scoring flow
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ScoringResult,
	TestCase,
	TestCaseResult,
} from "../schemas/index.js";
import { type ExtractedCode, extractCode } from "./code-extractor.js";
import { logger } from "./logger.js";
import { hasScoringSpec, loadScoringSpec } from "./scoring-spec.js";
import { suppressStdout, suppressStdoutAsync } from "./stdout-suppressor.js";

/** Default timeout for scoring (5 seconds). */
const DEFAULT_SCORING_TIMEOUT_MS = 5000;

/**
 * Generates a unique temp file path.
 */
function getTempFilePath(): string {
	const id = Math.random().toString(36).substring(2, 10);
	return path.join(os.tmpdir(), `plebdev-bench-${id}.ts`);
}

/**
 * Compares two values for equality, with tolerance for floats.
 *
 * Limitations:
 * - Object/array comparison uses `JSON.stringify`, so key order differences fail equality.
 * - `undefined` object fields may differ from omitted fields.
 * - Complex runtime types (Date, Map, Set, class instances) are not normalized.
 * - Tolerance applies only when both values are finite numbers.
 *
 * @param actual - Actual value from function call
 * @param expected - Expected value from test case
 * @param tolerance - Optional tolerance for float comparison
 * @returns True if values match
 */
function valuesMatch(
	actual: unknown,
	expected: unknown,
	tolerance?: number,
): boolean {
	// Handle special float cases
	if (typeof actual === "number" && typeof expected === "number") {
		// Handle NaN
		if (Number.isNaN(actual) && Number.isNaN(expected)) {
			return true;
		}
		// Handle Infinity
		if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
			return actual === expected;
		}
		// Use tolerance if provided
		if (tolerance !== undefined) {
			return Math.abs(actual - expected) <= tolerance;
		}
	}

	// Deep equality for objects/arrays
	if (typeof actual === "object" && typeof expected === "object") {
		return JSON.stringify(actual) === JSON.stringify(expected);
	}

	// Strict equality
	return actual === expected;
}

/**
 * Runs a single test case against a module.
 *
 * @param module - The dynamically imported module
 * @param testCase - The test case to run
 * @param instance - Optional instance for method calls
 * @returns Test case result
 */
function runTestCase(
	module: Record<string, unknown>,
	testCase: TestCase,
	instance?: unknown,
): TestCaseResult {
	const name =
		testCase.description ||
		`${testCase.fn}(${JSON.stringify(testCase.args).slice(1, -1)})`;

	try {
		// Determine the target (module export or instance method)
		let target: unknown;
		let thisArg: unknown = undefined;

		if (instance && typeof instance === "object") {
			target = (instance as Record<string, unknown>)[testCase.fn];
			thisArg = instance;
		} else {
			target = module[testCase.fn];
		}

		// Check if function exists
		if (typeof target !== "function") {
			return {
				name,
				passed: false,
				expected: testCase.expected,
				error: `Function "${testCase.fn}" not found or not a function`,
			};
		}

		// Call the function (preserve `this` for instance methods)
		const targetFn = target as (...args: unknown[]) => unknown;
		const actual =
			thisArg !== undefined
				? targetFn.bind(thisArg)(...testCase.args)
				: targetFn(...testCase.args);

		// If no expected value is provided, test passes as long as function doesn't throw
		if (testCase.expected === undefined) {
			return {
				name,
				passed: true,
				actual,
			};
		}

		// Compare result
		const passed = valuesMatch(actual, testCase.expected, testCase.tolerance);

		return {
			name,
			passed,
			expected: testCase.expected,
			actual,
			error: passed ? undefined : "Value mismatch",
		};
	} catch (error) {
		return {
			name,
			passed: false,
			expected: testCase.expected,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Creates an instance using the factory function if specified.
 *
 * @param module - The dynamically imported module
 * @param factoryFn - Name of factory function or class
 * @returns The created instance or undefined
 */
function createInstance(
	module: Record<string, unknown>,
	factoryFn?: string,
): unknown {
	if (!factoryFn) {
		return undefined;
	}

	const factory = module[factoryFn];

	if (typeof factory === "function") {
		const factorySource = Function.prototype.toString.call(factory).trim();
		if (factorySource.startsWith("class")) {
			return new (factory as new () => unknown)();
		}

		try {
			return (factory as () => unknown)();
		} catch (error) {
			if (error instanceof TypeError) {
				return new (factory as new () => unknown)();
			}
			throw error;
		}
	}

	return undefined;
}

/**
 * Imports a module with a timeout and suppressed stdout.
 *
 * @param filePath - Path to the file to import
 * @param timeoutMs - Timeout in milliseconds
 * @returns The imported module
 */
async function importWithTimeout(
	filePath: string,
	timeoutMs: number,
): Promise<Record<string, unknown>> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		// Add cache-busting query param
		const cacheBuster = `?t=${Date.now()}`;
		// Suppress stdout during import (module may have top-level console.log)
		const { promise: importPromise, restore } = suppressStdoutAsync(
			async () => {
				return await import(`${filePath}${cacheBuster}`);
			},
		);
		// Prevent unhandled rejections if timeout wins the race.
		void importPromise.catch(() => {});

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				restore();
				reject(new Error(`Import timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		const module = await Promise.race([importPromise, timeoutPromise]);
		return module as Record<string, unknown>;
	} finally {
		// Best-effort cleanup for timeout
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Scores generated code against a test's scoring spec in the current process.
 *
 * @param testSlug - Test directory name
 * @param rawOutput - Raw output from LLM generation
 * @param timeoutMs - Timeout for scoring (default: 5s)
 * @param codeFilePath - Optional path to code file written by tool-calling harness
 * @returns Scoring result with pass/fail counts
 * @throws {Error} Unexpected internal failures outside normal scoring result flow
 */
export async function scoreGenerationInProcess(
	testSlug: string,
	rawOutput: string,
	timeoutMs: number = DEFAULT_SCORING_TIMEOUT_MS,
	codeFilePath?: string,
): Promise<ScoringResult> {
	const log = logger.child({ testSlug, operation: "scoring" });

	// Check if test has a scoring spec
	if (!hasScoringSpec(testSlug)) {
		log.debug("No scoring spec found, skipping");
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: "No scoring spec found",
			failureType: "no_spec",
		};
	}

	// Extract code - prioritize file if provided by tool-calling harness
	let extracted: ExtractedCode;
	try {
		if (codeFilePath) {
			if (!fs.existsSync(codeFilePath)) {
				throw new Error(`Code file not found: ${codeFilePath}`);
			}
			let code: string;
			try {
				code = await fs.promises.readFile(codeFilePath, "utf-8");
			} catch (error) {
				throw new Error(
					`Failed to read code file at ${codeFilePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			extracted = { code, method: "file" };
			log.debug(
				{ method: "file", codeLength: code.length, codeFilePath },
				"Code read from file",
			);
		} else {
			extracted = extractCode(rawOutput);
			log.debug(
				{ method: extracted.method, codeLength: extracted.code.length },
				"Code extracted from text",
			);
		}
	} catch (error) {
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: `Code extraction failed: ${error instanceof Error ? error.message : String(error)}`,
			failureType: "extraction",
		};
	}

	// Load scoring spec
	let spec: Awaited<ReturnType<typeof loadScoringSpec>>;
	try {
		spec = await loadScoringSpec(testSlug);
	} catch (error) {
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: `Failed to load scoring spec: ${error instanceof Error ? error.message : String(error)}`,
			extractionMethod: extracted.method,
			failureType: "spec_load",
		};
	}

	// Write to temp file
	const tempPath = getTempFilePath();
	const expectedTotal = spec.expectedExports.length + spec.testCases.length;
	try {
		await fs.promises.writeFile(tempPath, extracted.code, "utf-8");
	} catch (error) {
		return {
			passed: 0,
			failed: expectedTotal,
			total: expectedTotal,
			error: `Failed to write temp file: ${error instanceof Error ? error.message : String(error)}`,
			extractionMethod: extracted.method,
			failureType: "extraction",
		};
	}

	try {
		// Dynamic import with timeout
		let module: Record<string, unknown>;
		try {
			module = await importWithTimeout(tempPath, timeoutMs);
		} catch (error) {
			return {
				passed: 0,
				failed: expectedTotal,
				total: expectedTotal,
				error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
				extractionMethod: extracted.method,
				failureType: "import",
			};
		}

		// Check expected exports
		const exportResults: TestCaseResult[] = [];
		for (const exp of spec.expectedExports) {
			const exportName = typeof exp === "string" ? exp : exp.name;
			const exportType = typeof exp === "string" ? undefined : exp.type;

			const hasExport = exportName in module;
			const actualType = hasExport ? typeof module[exportName] : undefined;
			const typeMatches = !exportType || actualType === exportType;

			exportResults.push({
				name: `export: ${exportName}`,
				passed: hasExport && typeMatches,
				error: !hasExport
					? `Missing export: ${exportName}`
					: !typeMatches
						? `Expected ${exportType}, got ${actualType}`
						: undefined,
			});
		}

		const failedExportResults = exportResults.filter(
			(result) => !result.passed,
		);
		if (failedExportResults.length > 0) {
			const passed = exportResults.length - failedExportResults.length;
			return {
				passed,
				failed: expectedTotal - passed,
				total: expectedTotal,
				details: exportResults,
				error: failedExportResults
					.map((result) => result.error)
					.filter((error): error is string => Boolean(error))
					.join("; "),
				extractionMethod: extracted.method,
				failureType: "missing_export",
			};
		}

		// Create instance if factory specified (suppress stdout from generated code)
		let instance: unknown;
		if (spec.factoryFn) {
			instance = suppressStdout(() => createInstance(module, spec.factoryFn));
			if (!instance) {
				return {
					passed: exportResults.length,
					failed: expectedTotal - exportResults.length,
					total: expectedTotal,
					details: exportResults,
					error: `Failed to create instance from "${spec.factoryFn}"`,
					extractionMethod: extracted.method,
					failureType: "factory_init_failed",
				};
			}
		}

		// Run test cases (suppress stdout from generated code)
		const testResults: TestCaseResult[] = [];
		for (const testCase of spec.testCases) {
			// Create fresh instance if needed
			if (spec.freshInstancePerTest && spec.factoryFn) {
				instance = suppressStdout(() => createInstance(module, spec.factoryFn));
			}

			const result = suppressStdout(() =>
				runTestCase(module, testCase, instance),
			);
			testResults.push(result);
		}

		// Combine results
		const allResults = [...exportResults, ...testResults];
		const passed = allResults.filter((r) => r.passed).length;
		const failed = allResults.filter((r) => !r.passed).length;

		log.debug({ passed, failed, total: allResults.length }, "Scoring complete");

		return {
			passed,
			failed,
			total: allResults.length,
			details: allResults,
			extractionMethod: extracted.method,
		};
	} finally {
		// Clean up temp file
		try {
			await fs.promises.unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
	}
}
