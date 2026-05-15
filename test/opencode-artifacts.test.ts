/**
 * Purpose: Unit tests for OpenCode artifact path hardening.
 * Exports: none
 *
 * Invariants:
 * - Expected solution files must stay inside the execution workspace.
 * - XDG data home is either unset or absolute before artifact roots are derived.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	cleanupOpenCodeArtifacts,
	prepareOpenCodeArtifacts,
	resolveOpenCodeToolOutputRoot,
} from "../src/harnesses/opencode-artifacts.js";

const ORIGINAL_XDG_DATA_HOME = process.env.XDG_DATA_HOME;
const tempRoots: string[] = [];
let testXdgDataHome: string;

async function createTempRoot(): Promise<string> {
	const tempRoot = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "plebdev-opencode-artifacts-"),
	);
	tempRoots.push(tempRoot);
	return tempRoot;
}

function restoreXdgDataHome(): void {
	if (ORIGINAL_XDG_DATA_HOME === undefined) {
		Reflect.deleteProperty(process.env, "XDG_DATA_HOME");
		return;
	}
	process.env.XDG_DATA_HOME = ORIGINAL_XDG_DATA_HOME;
}

beforeEach(async () => {
	testXdgDataHome = await createTempRoot();
	process.env.XDG_DATA_HOME = testXdgDataHome;
});

afterEach(async () => {
	restoreXdgDataHome();
	await Promise.all(
		tempRoots.splice(0).map((tempRoot) =>
			fs.promises.rm(tempRoot, {
				recursive: true,
				force: true,
			}),
		),
	);
});

describe("resolveOpenCodeToolOutputRoot", () => {
	it("rejects relative XDG_DATA_HOME values", () => {
		process.env.XDG_DATA_HOME = ".";

		expect(() => resolveOpenCodeToolOutputRoot()).toThrow(
			"XDG_DATA_HOME must be an absolute path when set",
		);
	});

	it("uses absolute XDG_DATA_HOME values", async () => {
		expect(resolveOpenCodeToolOutputRoot()).toBe(
			path.join(testXdgDataHome, "opencode", "tool-output"),
		);
	});
});

describe("prepareOpenCodeArtifacts", () => {
	it("accepts basename solution filenames inside the execution workspace", async () => {
		const artifacts = await prepareOpenCodeArtifacts({
			solutionFilename: "solution.ts",
		});

		try {
			expect(artifacts.solutionPath).toBe(
				path.join(artifacts.executionWorkspaceDir, "solution.ts"),
			);
		} finally {
			await cleanupOpenCodeArtifacts(artifacts, { preserveWorkspace: false });
		}
	});

	it("accepts basename solution filenames with adjacent dots", async () => {
		const artifacts = await prepareOpenCodeArtifacts({
			solutionFilename: "file..txt",
		});

		try {
			expect(artifacts.solutionPath).toBe(
				path.join(artifacts.executionWorkspaceDir, "file..txt"),
			);
		} finally {
			await cleanupOpenCodeArtifacts(artifacts, { preserveWorkspace: false });
		}
	});

	it("rejects missing caller-supplied workspaces", async () => {
		const missingWorkspace = path.join(testXdgDataHome, "missing-workspace");

		await expect(
			prepareOpenCodeArtifacts({
				workingDirectory: missingWorkspace,
				solutionFilename: "solution.ts",
			}),
		).rejects.toThrow("OpenCode workingDirectory does not exist");
	});

	it("rejects caller-supplied workspaces that are files", async () => {
		const filePath = path.join(testXdgDataHome, "workspace-file");
		await fs.promises.writeFile(filePath, "not a directory", "utf-8");

		await expect(
			prepareOpenCodeArtifacts({
				workingDirectory: filePath,
				solutionFilename: "solution.ts",
			}),
		).rejects.toThrow("OpenCode workingDirectory must be a directory");
	});

	it("rejects parent-segment solution filenames", async () => {
		await expect(
			prepareOpenCodeArtifacts({ solutionFilename: "../solution.ts" }),
		).rejects.toThrow("solutionFilename must be a basename");
	});

	it("rejects absolute solution filenames", async () => {
		await expect(
			prepareOpenCodeArtifacts({ solutionFilename: "/tmp/solution.ts" }),
		).rejects.toThrow("solutionFilename must be a basename");
	});

	it("rejects nested solution filenames", async () => {
		await expect(
			prepareOpenCodeArtifacts({ solutionFilename: "nested/solution.ts" }),
		).rejects.toThrow("solutionFilename must be a basename");
	});
});
