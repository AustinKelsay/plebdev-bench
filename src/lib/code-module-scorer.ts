/**
 * Purpose: Score generated TypeScript modules against export and function-call specs.
 * Exports: scoreCodeModule
 *
 * Invariants:
 * - Never throws for normal scoring failures; returns structured ScoringResult errors.
 * - Generated code is imported from a temp file with cache-busting.
 * - Stdout from generated modules is suppressed during import and execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type {
	ScoringResult,
	ScoringSpec,
	TestCase,
	TestCaseResult,
} from "../schemas/index.js";
import { type ExtractedCode, extractCode } from "./code-extractor.js";
import { logger } from "./logger.js";
import { suppressStdout, suppressStdoutAsync } from "./stdout-suppressor.js";

/** Default timeout for scoring (5 seconds). */
const DEFAULT_SCORING_TIMEOUT_MS = 5000;

/**
 * Generates a unique temp file path.
 *
 * @returns Temporary TypeScript file path
 */
function getTempFilePath(): string {
	const id = Math.random().toString(36).substring(2, 10);
	return path.join(os.tmpdir(), `plebdev-bench-${id}.ts`);
}

/**
 * Compares two values for equality, with tolerance for floats.
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
	if (typeof actual === "number" && typeof expected === "number") {
		if (Number.isNaN(actual) && Number.isNaN(expected)) {
			return true;
		}
		if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
			return actual === expected;
		}
		if (tolerance !== undefined) {
			return Math.abs(actual - expected) <= tolerance;
		}
	}

	if (typeof actual === "object" && typeof expected === "object") {
		return JSON.stringify(actual) === JSON.stringify(expected);
	}

	return actual === expected;
}

/**
 * Builds a stable test name.
 *
 * @param testCase - Scoring test case
 * @returns Human-readable name
 */
function getTestCaseName(testCase: TestCase): string {
	return (
		testCase.description ||
		`${testCase.fn}(${JSON.stringify(testCase.args).slice(1, -1)})`
	);
}

/**
 * Builds a failed test case result for factory initialization errors.
 *
 * @param testCase - Test case being evaluated
 * @param factoryFn - Factory function name
 * @param error - Thrown error
 * @returns Failed test case result
 */
function buildFactoryInitTestFailure(
	testCase: TestCase,
	factoryFn: string,
	error: unknown,
): TestCaseResult {
	const errorMessage =
		error instanceof Error ? error.message || error.name : String(error);
	return {
		name: getTestCaseName(testCase),
		passed: false,
		expected: testCase.expected,
		error: `Failed to create instance from "${factoryFn}": ${errorMessage}`,
	};
}

/**
 * Runs one spec test case.
 *
 * @param module - Dynamically imported module
 * @param testCase - Test case to evaluate
 * @param instance - Optional instance for method calls
 * @returns Structured test case result
 */
function runTestCase(
	module: Record<string, unknown>,
	testCase: TestCase,
	instance?: unknown,
): TestCaseResult {
	const name = getTestCaseName(testCase);

	try {
		let target: unknown;
		let thisArg: unknown = undefined;

		if (instance && typeof instance === "object") {
			target = (instance as Record<string, unknown>)[testCase.fn];
			thisArg = instance;
		} else {
			target = module[testCase.fn];
		}

		if (typeof target !== "function") {
			return {
				name,
				passed: false,
				expected: testCase.expected,
				error: `Function "${testCase.fn}" not found or not a function`,
			};
		}

		const targetFn = target as (...args: unknown[]) => unknown;
		const actual =
			thisArg !== undefined
				? targetFn.bind(thisArg)(...testCase.args)
				: targetFn(...testCase.args);

		if (testCase.expected === undefined) {
			return {
				name,
				passed: true,
				actual,
			};
		}

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
 * Creates an instance from a factory export when requested.
 *
 * @param module - Imported module
 * @param factoryFn - Factory function or class name
 * @returns Created instance or undefined
 */
function createInstance(
	module: Record<string, unknown>,
	factoryFn?: string,
): unknown {
	if (!factoryFn) {
		return undefined;
	}

	const factory = module[factoryFn];
	if (typeof factory !== "function") {
		return undefined;
	}

	const factorySource = Function.prototype.toString.call(factory).trim();
	if (factorySource.startsWith("class")) {
		return new (factory as new () => unknown)();
	}

	try {
		return (factory as () => unknown)();
	} catch (error) {
		if (
			error instanceof TypeError &&
			/^\s*Class constructor .* cannot be invoked without ['"]new['"]\s*$/i.test(
				error.message,
			)
		) {
			return new (factory as new () => unknown)();
		}
		throw error;
	}
}

/**
 * Imports a temp module with timeout and stdout suppression.
 *
 * @param filePath - Temp file path
 * @param timeoutMs - Import timeout
 * @returns Imported module namespace
 */
async function importWithTimeout(
	filePath: string,
	timeoutMs: number,
): Promise<Record<string, unknown>> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		const fileUrl = pathToFileURL(filePath);
		fileUrl.searchParams.set("t", String(Date.now()));
		const { promise: importPromise, restore } = suppressStdoutAsync(
			async () => await import(fileUrl.toString()),
		);
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
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Extracts candidate code from raw model output or a written code file.
 *
 * @param rawOutput - Raw harness output
 * @param codeFilePath - Optional file emitted by a tool harness
 * @returns Extracted code and extraction metadata
 */
async function extractScoringCode(
	rawOutput: string,
	codeFilePath?: string,
): Promise<ExtractedCode> {
	if (!codeFilePath) {
		return extractCode(rawOutput);
	}
	if (!fs.existsSync(codeFilePath)) {
		throw new Error(`Code file not found: ${codeFilePath}`);
	}
	const code = await fs.promises.readFile(codeFilePath, "utf-8");
	return { code, method: "file" };
}

/**
 * Scores generated code against a module-style benchmark spec.
 *
 * @param testSlug - Benchmark test slug
 * @param spec - Loaded scoring spec
 * @param rawOutput - Raw harness output
 * @param timeoutMs - Scoring timeout
 * @param codeFilePath - Optional code file written by a tool harness
 * @returns Structured scoring result
 */
export async function scoreCodeModule(
	testSlug: string,
	spec: ScoringSpec,
	rawOutput: string,
	timeoutMs: number = DEFAULT_SCORING_TIMEOUT_MS,
	codeFilePath?: string,
): Promise<ScoringResult> {
	const log = logger.child({ testSlug, operation: "scoring" });

	let extracted: ExtractedCode;
	try {
		extracted = await extractScoringCode(rawOutput, codeFilePath);
		log.debug(
			{
				method: extracted.method,
				codeLength: extracted.code.length,
				...(codeFilePath ? { codeFilePath } : {}),
			},
			"Prepared code for scoring",
		);
	} catch (error) {
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: `Code extraction failed: ${error instanceof Error ? error.message : String(error)}`,
			failureType: "extraction",
		};
	}

	const expectedTotal = spec.expectedExports.length + spec.testCases.length;
	const tempPath = getTempFilePath();
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

		const buildFactoryInitFailure = (error: unknown): ScoringResult => {
			const errorText =
				error instanceof Error
					? (error.stack?.trim() ?? error.message)
					: String(error);
			return {
				passed: exportResults.length,
				failed: expectedTotal - exportResults.length,
				total: expectedTotal,
				details: exportResults,
				error: `Failed to create instance from "${spec.factoryFn}": ${errorText}`,
				extractionMethod: extracted.method,
				failureType: "factory_init_failed",
			};
		};

		let instance: unknown;
		if (spec.factoryFn) {
			try {
				instance = suppressStdout(() => createInstance(module, spec.factoryFn));
			} catch (error) {
				return buildFactoryInitFailure(error);
			}
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

		const testResults: TestCaseResult[] = [];
		for (const testCase of spec.testCases) {
			if (spec.freshInstancePerTest && spec.factoryFn) {
				try {
					instance = suppressStdout(() =>
						createInstance(module, spec.factoryFn),
					);
				} catch (error) {
					testResults.push(
						buildFactoryInitTestFailure(testCase, spec.factoryFn, error),
					);
					continue;
				}
				if (!instance) {
					testResults.push({
						name: getTestCaseName(testCase),
						passed: false,
						expected: testCase.expected,
						error: `Failed to create instance from "${spec.factoryFn}"`,
					});
					continue;
				}
			}

			testResults.push(
				suppressStdout(() => runTestCase(module, testCase, instance)),
			);
		}

		const allResults = [...exportResults, ...testResults];
		const passed = allResults.filter((result) => result.passed).length;
		const failed = allResults.length - passed;

		log.debug({ passed, failed, total: allResults.length }, "Scoring complete");

		return {
			passed,
			failed,
			total: allResults.length,
			details: allResults,
			extractionMethod: extracted.method,
		};
	} finally {
		await fs.promises.unlink(tempPath).catch(() => {});
	}
}
