/**
 * Purpose: Score filesystem-driven computer-use tasks against workspace assertions.
 * Exports: scoreWorkspace
 *
 * Invariants:
 * - Scoring never mutates the workspace.
 * - Results are deterministic and compare exact file paths/content/mutation sets.
 * - Unexpected workspace changes are surfaced as explicit failed checks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type {
	ScoringResult,
	ScoringSpec,
	TestCaseResult,
	WorkspaceMutationSet,
} from "../schemas/index.js";
import {
	type WorkspaceManifest,
	collectWorkspaceManifest,
	diffWorkspaceManifests,
	loadWorkspaceBaseline,
} from "./workspace-manifest.js";

/**
 * Formats a relative workspace path into an absolute path.
 *
 * @param workspaceDir - Workspace root
 * @param relativePath - Relative path from workspace root
 * @returns Absolute file path
 */
function toAbsolutePath(workspaceDir: string, relativePath: string): string {
	return path.join(workspaceDir, ...relativePath.split("/"));
}

/**
 * Builds a stable failure result for workspace setup/scoring errors.
 *
 * @param message - Human-readable failure text
 * @returns Structured scoring failure result
 */
function buildWorkspaceFailure(message: string): ScoringResult {
	return {
		passed: 0,
		failed: 1,
		total: 1,
		error: message,
		failureType: "test_execution",
	};
}

/**
 * Compares two sorted path arrays for exact equality.
 *
 * @param actual - Actual paths
 * @param expected - Expected paths
 * @returns True when arrays match exactly
 */
function pathsMatchExactly(actual: string[], expected: string[]): boolean {
	if (actual.length !== expected.length) {
		return false;
	}
	for (let index = 0; index < actual.length; index += 1) {
		if (actual[index] !== expected[index]) {
			return false;
		}
	}
	return true;
}

/**
 * Builds a test result for one mutation-set comparison.
 *
 * @param label - Mutation bucket label
 * @param actual - Actual relative paths
 * @param expected - Expected relative paths
 * @returns Result describing exact-match success or failure
 */
function buildMutationResult(
	label: keyof WorkspaceMutationSet,
	actual: string[],
	expected: string[],
): TestCaseResult {
	const passed = pathsMatchExactly(actual, expected);
	return {
		name: `mutations.${label} exact match`,
		passed,
		expected,
		actual,
		error: passed ? undefined : `Expected ${label} paths to match exactly`,
	};
}

/**
 * Scores a workspace-scored benchmark task.
 *
 * @param spec - Loaded scoring spec
 * @param workspaceDir - Workspace root directory
 * @returns Structured scoring result
 */
export async function scoreWorkspace(
	spec: ScoringSpec,
	workspaceDir: string,
): Promise<ScoringResult> {
	if (spec.workspace === undefined) {
		return buildWorkspaceFailure(
			`Workspace scoring spec missing for "${spec.testSlug}"`,
		);
	}

	let baselineManifest: WorkspaceManifest;
	let currentManifest: WorkspaceManifest;
	try {
		baselineManifest = await loadWorkspaceBaseline(workspaceDir);
		currentManifest = await collectWorkspaceManifest(workspaceDir);
	} catch (error) {
		return buildWorkspaceFailure(
			error instanceof Error ? error.message : String(error),
		);
	}

	const mutationDiff = diffWorkspaceManifests(
		baselineManifest,
		currentManifest,
	);
	const results: TestCaseResult[] = [];

	for (const relativePath of spec.workspace.requiredPaths) {
		const absolutePath = toAbsolutePath(workspaceDir, relativePath);
		const passed = fs.existsSync(absolutePath);
		results.push({
			name: `path exists: ${relativePath}`,
			passed,
			error: passed ? undefined : `Missing required path "${relativePath}"`,
		});
	}

	for (const relativePath of spec.workspace.absentPaths) {
		const absolutePath = toAbsolutePath(workspaceDir, relativePath);
		const passed = !fs.existsSync(absolutePath);
		results.push({
			name: `path absent: ${relativePath}`,
			passed,
			error: passed ? undefined : `Path should be absent: "${relativePath}"`,
		});
	}

	for (const fileAssertion of spec.workspace.files) {
		const absolutePath = toAbsolutePath(workspaceDir, fileAssertion.path);
		let actualContent: string | undefined;
		let error: string | undefined;
		try {
			actualContent = await fs.promises.readFile(absolutePath, "utf-8");
		} catch (readError) {
			error =
				readError instanceof Error ? readError.message : String(readError);
		}
		const passed = actualContent === fileAssertion.content;
		results.push({
			name: `file content: ${fileAssertion.path}`,
			passed,
			expected: fileAssertion.content,
			actual: actualContent,
			error: passed
				? undefined
				: error === undefined
					? `Content mismatch for "${fileAssertion.path}"`
					: `Failed to read "${fileAssertion.path}": ${error}`,
		});
	}

	for (const jsonAssertion of spec.workspace.jsonFiles) {
		const absolutePath = toAbsolutePath(workspaceDir, jsonAssertion.path);
		let actualValue: unknown;
		let error: string | undefined;
		try {
			const raw = await fs.promises.readFile(absolutePath, "utf-8");
			actualValue = JSON.parse(raw);
		} catch (readError) {
			error =
				readError instanceof Error ? readError.message : String(readError);
		}
		const passed =
			error === undefined &&
			isDeepStrictEqual(actualValue, jsonAssertion.value);
		results.push({
			name: `json file: ${jsonAssertion.path}`,
			passed,
			expected: jsonAssertion.value,
			actual: actualValue,
			error: passed
				? undefined
				: error === undefined
					? `JSON mismatch in "${jsonAssertion.path}"`
					: `Failed to read JSON "${jsonAssertion.path}": ${error}`,
		});
	}

	results.push(
		buildMutationResult(
			"created",
			mutationDiff.created,
			spec.workspace.mutations.created,
		),
		buildMutationResult(
			"modified",
			mutationDiff.modified,
			spec.workspace.mutations.modified,
		),
		buildMutationResult(
			"deleted",
			mutationDiff.deleted,
			spec.workspace.mutations.deleted,
		),
	);

	const passed = results.filter((result) => result.passed).length;
	const failed = results.length - passed;

	return {
		passed,
		failed,
		total: results.length,
		details: results,
		...(failed > 0
			? {
					error: results
						.filter((result) => !result.passed && result.error)
						.map((result) => result.error)
						.join("; "),
					failureType: "test_execution" as const,
				}
			: {}),
	};
}
