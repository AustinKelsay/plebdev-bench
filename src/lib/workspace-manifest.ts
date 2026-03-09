/**
 * Purpose: Snapshot and diff benchmark workspaces for filesystem-scored tests.
 * Exports: WORKSPACE_BASELINE_FILENAME, collectWorkspaceManifest,
 *          writeWorkspaceBaseline, loadWorkspaceBaseline, diffWorkspaceManifests
 *
 * Invariants:
 * - Paths are stored relative to the workspace root using POSIX separators.
 * - The hidden baseline file itself is excluded from manifests and diffs.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Hidden manifest filename written into seeded benchmark workspaces. */
export const WORKSPACE_BASELINE_FILENAME = ".plebdev-bench-baseline.json";

/** Snapshot of workspace files keyed by relative path. */
export type WorkspaceManifest = Record<string, string>;

/** Exact file-level diff between two workspace manifests. */
export interface WorkspaceManifestDiff {
	created: string[];
	modified: string[];
	deleted: string[];
}

/**
 * Converts an absolute file path into a stable workspace-relative path.
 *
 * @param rootDir - Workspace root
 * @param absolutePath - File path inside the workspace
 * @returns POSIX-style relative path
 */
function toRelativeWorkspacePath(
	rootDir: string,
	absolutePath: string,
): string {
	return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

/**
 * Computes a SHA-256 hash for file contents.
 *
 * @param filePath - Absolute file path
 * @returns Stable content hash
 */
async function hashFile(filePath: string): Promise<string> {
	const content = await fs.promises.readFile(filePath);
	return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Recursively collects all files in a workspace.
 *
 * @param rootDir - Workspace root directory
 * @param currentDir - Current directory in traversal
 * @param manifest - Mutable output manifest
 */
async function collectFiles(
	rootDir: string,
	currentDir: string,
	manifest: WorkspaceManifest,
): Promise<void> {
	const entries = await fs.promises.readdir(currentDir, {
		withFileTypes: true,
	});
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const absolutePath = path.join(currentDir, entry.name);
		const relativePath = toRelativeWorkspacePath(rootDir, absolutePath);
		if (relativePath === WORKSPACE_BASELINE_FILENAME) {
			continue;
		}
		if (entry.isDirectory()) {
			await collectFiles(rootDir, absolutePath, manifest);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		manifest[relativePath] = await hashFile(absolutePath);
	}
}

/**
 * Captures the current file manifest for a benchmark workspace.
 *
 * @param rootDir - Workspace root directory
 * @returns Relative path to content-hash map
 */
export async function collectWorkspaceManifest(
	rootDir: string,
): Promise<WorkspaceManifest> {
	const manifest: WorkspaceManifest = {};
	await collectFiles(rootDir, rootDir, manifest);
	return manifest;
}

/**
 * Persists the initial workspace manifest for later exact diffing.
 *
 * @param rootDir - Workspace root directory
 */
export async function writeWorkspaceBaseline(rootDir: string): Promise<void> {
	const manifest = await collectWorkspaceManifest(rootDir);
	const baselinePath = path.join(rootDir, WORKSPACE_BASELINE_FILENAME);
	await fs.promises.writeFile(baselinePath, JSON.stringify(manifest, null, 2));
}

/**
 * Loads the seeded baseline manifest for a workspace.
 *
 * @param rootDir - Workspace root directory
 * @returns Parsed baseline manifest
 * @throws {Error} If the baseline file is missing or invalid
 */
export async function loadWorkspaceBaseline(
	rootDir: string,
): Promise<WorkspaceManifest> {
	const baselinePath = path.join(rootDir, WORKSPACE_BASELINE_FILENAME);
	let raw: string;
	try {
		raw = await fs.promises.readFile(baselinePath, "utf-8");
	} catch (error) {
		throw new Error(
			`Workspace baseline not found at "${baselinePath}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Workspace baseline is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (
		parsed === null ||
		typeof parsed !== "object" ||
		Array.isArray(parsed) ||
		Object.values(parsed).some((value) => typeof value !== "string")
	) {
		throw new Error("Workspace baseline must be a string map");
	}

	return parsed as WorkspaceManifest;
}

/**
 * Computes created/modified/deleted file sets relative to the baseline.
 *
 * @param baseline - Initial workspace manifest
 * @param current - Current workspace manifest
 * @returns Exact diff of created/modified/deleted files
 */
export function diffWorkspaceManifests(
	baseline: WorkspaceManifest,
	current: WorkspaceManifest,
): WorkspaceManifestDiff {
	const created = Object.keys(current)
		.filter((filePath) => !(filePath in baseline))
		.sort((a, b) => a.localeCompare(b));
	const modified = Object.keys(current)
		.filter(
			(filePath) =>
				filePath in baseline && baseline[filePath] !== current[filePath],
		)
		.sort((a, b) => a.localeCompare(b));
	const deleted = Object.keys(baseline)
		.filter((filePath) => !(filePath in current))
		.sort((a, b) => a.localeCompare(b));

	return { created, modified, deleted };
}
