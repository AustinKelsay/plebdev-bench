/**
 * Purpose: Seed isolated benchmark workspaces from per-test fixtures.
 * Exports: PreparedTestWorkspace, prepareTestWorkspace
 *
 * Invariants:
 * - Each workspace is created under the OS temp directory.
 * - Fixture contents are copied verbatim before writing the hidden baseline.
 * - Workspaces are deleted after use unless preservation is explicitly enabled.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { writeWorkspaceBaseline } from "./workspace-manifest.js";

/** Environment flag for preserving benchmark workspaces after execution. */
const PRESERVE_WORKSPACES_ENV = "PLEBDEV_BENCH_PRESERVE_WORKSPACES";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validates that a benchmark slug is a single safe path segment.
 *
 * @param testSlug - Benchmark test slug
 * @throws {RangeError} If the slug is empty or contains traversal/path separators
 */
function assertValidTestSlug(testSlug: string): void {
	if (
		testSlug.trim().length === 0 ||
		testSlug === "." ||
		testSlug === ".." ||
		testSlug.includes("/") ||
		testSlug.includes("\\") ||
		path.basename(testSlug) !== testSlug
	) {
		throw new RangeError(
			`Invalid test slug "${testSlug}": expected a single path segment`,
		);
	}
}

/** Prepared isolated workspace ready for a benchmark item. */
export interface PreparedTestWorkspace {
	/** Root directory where the harness should run. */
	rootDir: string;

	/** Deletes the workspace unless preservation is enabled. */
	cleanup(): Promise<void>;
}

/**
 * Resolves the fixtures directory for a test.
 *
 * @param testSlug - Benchmark test slug
 * @returns Fixtures directory path
 */
function getFixturesPath(testSlug: string): string {
	assertValidTestSlug(testSlug);
	return path.join(MODULE_DIR, "..", "tests", testSlug, "fixtures");
}

/**
 * Checks whether workspace preservation is enabled.
 *
 * @returns True when temp workspaces should be kept on disk
 */
function shouldPreserveWorkspaces(): boolean {
	return process.env[PRESERVE_WORKSPACES_ENV] === "1";
}

/**
 * Creates an isolated workspace and copies fixture files into it.
 *
 * @param testSlug - Benchmark test slug
 * @returns Prepared workspace and cleanup callback
 */
export async function prepareTestWorkspace(
	testSlug: string,
): Promise<PreparedTestWorkspace> {
	assertValidTestSlug(testSlug);
	const rootDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), `plebdev-bench-${testSlug}-`),
	);
	const fixturesPath = getFixturesPath(testSlug);

	if (fs.existsSync(fixturesPath)) {
		await fs.promises.cp(fixturesPath, rootDir, { recursive: true });
	}

	await writeWorkspaceBaseline(rootDir);

	return {
		rootDir,
		async cleanup(): Promise<void> {
			if (shouldPreserveWorkspaces()) {
				return;
			}
			await fs.promises.rm(rootDir, { recursive: true, force: true });
		},
	};
}
