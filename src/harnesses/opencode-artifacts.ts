/**
 * Purpose: OpenCode per-generation workspace/config artifact management.
 * Exports: OpenCodeArtifacts, resolveOpenCodeToolOutputRoot,
 *          prepareOpenCodeArtifacts, readUsableOpenCodeSolution,
 *          cleanupOpenCodeArtifacts
 *
 * Invariants:
 * - Code-output mode gets an isolated generated workspace by default.
 * - Caller-provided workspaces are preserved and resolved to canonical paths.
 * - Config directories are always generated outside benchmark workspaces.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

const OPENCODE_TOOL_OUTPUT_SUBPATH = path.join("opencode", "tool-output");

function isErrorWithCode(error: unknown, code: string): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

/** Prepared filesystem paths for one OpenCode generation. */
export interface OpenCodeArtifacts {
	/** Random run token used in generated paths. */
	runId: string;
	/** Root directory for generated OpenCode benchmark artifacts. */
	toolOutputRoot: string;
	/** Original workspace path, generated or caller supplied. */
	workspaceDir: string;
	/** Canonical workspace path passed to OpenCode `--dir`. */
	executionWorkspaceDir: string;
	/** True when the workspace is owned by the caller/runner. */
	hasExternalWorkspace: boolean;
	/** Generated config directory for this item. */
	configDir: string;
	/** Generated `opencode.json` path for this item. */
	configPath: string;
	/** Expected code-output file path. */
	solutionPath: string;
}

const PrepareOpenCodeArtifactsOptsSchema = z.object({
	workingDirectory: z.string().min(1).optional(),
	solutionFilename: z.string().min(1),
});

/**
 * Resolves OpenCode benchmark artifact storage under XDG data home.
 *
 * @returns Absolute tool-output root used for generated workspaces/configs
 */
export function resolveOpenCodeToolOutputRoot(): string {
	z.object({ XDG_DATA_HOME: z.string().optional() })
		.passthrough()
		.parse(process.env);

	const xdgDataHome =
		typeof process.env.XDG_DATA_HOME === "string" &&
		process.env.XDG_DATA_HOME.trim().length > 0
			? process.env.XDG_DATA_HOME.trim()
			: path.join(os.homedir(), ".local", "share");

	return path.join(xdgDataHome, OPENCODE_TOOL_OUTPUT_SUBPATH);
}

/**
 * Creates per-generation OpenCode workspace/config directories.
 *
 * @param opts - Optional caller workspace and expected solution filename
 * @returns Prepared artifact paths
 * @throws z.ZodError when inputs are invalid
 * @throws {Error} when directories cannot be created or resolved
 */
export async function prepareOpenCodeArtifacts(opts: {
	workingDirectory?: string;
	solutionFilename: string;
}): Promise<OpenCodeArtifacts> {
	const parsed = PrepareOpenCodeArtifactsOptsSchema.parse(opts);
	const runId = crypto.randomBytes(8).toString("hex");
	const toolOutputRoot = resolveOpenCodeToolOutputRoot();
	const hasExternalWorkspace = parsed.workingDirectory !== undefined;
	const workspaceDir =
		parsed.workingDirectory ??
		path.join(toolOutputRoot, `plebdev-bench-opencode-${runId}`);
	const configDir = path.join(
		toolOutputRoot,
		`plebdev-bench-opencode-config-${runId}`,
	);

	await fs.promises.mkdir(workspaceDir, { recursive: true });
	await fs.promises.mkdir(configDir, { recursive: true });

	const executionWorkspaceDir = await fs.promises.realpath(workspaceDir);

	return {
		runId,
		toolOutputRoot,
		workspaceDir,
		executionWorkspaceDir,
		hasExternalWorkspace,
		configDir,
		configPath: path.join(configDir, "opencode.json"),
		solutionPath: path.join(executionWorkspaceDir, parsed.solutionFilename),
	};
}

/**
 * Reads the expected OpenCode solution file when it contains usable code.
 *
 * @param solutionPath - Expected solution file path
 * @param minOutputLength - Minimum non-whitespace content length
 * @returns Code file path/content when present and usable, otherwise undefined
 */
export async function readUsableOpenCodeSolution(
	solutionPath: string,
	minOutputLength: number,
): Promise<{ codeFilePath: string; code: string } | undefined> {
	let code: string;
	try {
		code = await fs.promises.readFile(solutionPath, "utf-8");
	} catch (error) {
		if (isErrorWithCode(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	}

	if (code.trim().length < minOutputLength) {
		return undefined;
	}

	return {
		codeFilePath: solutionPath,
		code,
	};
}

/**
 * Removes generated OpenCode config/workspace artifacts when safe.
 *
 * @param artifacts - Prepared paths to clean up
 * @param opts - Cleanup policy
 */
export async function cleanupOpenCodeArtifacts(
	artifacts: OpenCodeArtifacts,
	opts: { preserveWorkspace: boolean },
): Promise<void> {
	await fs.promises.rm(artifacts.configDir, {
		recursive: true,
		force: true,
	});

	if (!artifacts.hasExternalWorkspace && !opts.preserveWorkspace) {
		await fs.promises.rm(artifacts.workspaceDir, {
			recursive: true,
			force: true,
		});
	}
}
