/**
 * Purpose: Validate workspace-scored benchmark execution against seeded fixtures.
 * Exports: none
 * Invariants:
 * - Uses deterministic local fixtures only.
 * - Makes no network calls.
 * - Verifies exact filesystem scoring behavior against isolated temp workspaces.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scoreGenerationInProcess } from "../src/lib/scorer-core.js";
import {
	type PreparedTestWorkspace,
	prepareTestWorkspace,
} from "../src/lib/test-workspace.js";

const preparedWorkspaces: PreparedTestWorkspace[] = [];

/**
 * Creates a prepared benchmark workspace and registers it for cleanup.
 *
 * @param testSlug - Benchmark test slug
 * @returns Prepared workspace
 */
async function createWorkspace(
	testSlug: string,
): Promise<PreparedTestWorkspace> {
	const workspace = await prepareTestWorkspace(testSlug);
	preparedWorkspaces.push(workspace);
	return workspace;
}

afterEach(async () => {
	for (const workspace of preparedWorkspaces.splice(0)) {
		await workspace.cleanup();
	}
});

describe("workspace scoring", () => {
	it("rejects test slugs that are not single safe path segments", async () => {
		await expect(prepareTestWorkspace("../workspace-smoke")).rejects.toThrow(
			'Invalid test slug "../workspace-smoke": expected a single path segment',
		);
	});

	it("passes when workspace-smoke matches the expected end state", async () => {
		const workspace = await createWorkspace("workspace-smoke");
		await fs.promises.mkdir(path.join(workspace.rootDir, "logs"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "checklist"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "artifacts"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "logs", "session.log"),
			"session-started\nworkspace-smoke\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "checklist", "steps.txt"),
			"bootstrap\nverify-inputs\narchive-results\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "artifacts", "summary.json"),
			JSON.stringify(
				{
					status: "ready",
					createdBy: "workspace-smoke",
					steps: 3,
				},
				null,
				2,
			),
		);

		const result = await scoreGenerationInProcess(
			"workspace-smoke",
			"",
			5000,
			undefined,
			workspace.rootDir,
		);

		expect(result.failed).toBe(0);
		expect(result.passed).toBe(result.total);
	});

	it("fails when a workspace task makes unexpected extra changes", async () => {
		const workspace = await createWorkspace("workspace-smoke");
		await fs.promises.mkdir(path.join(workspace.rootDir, "logs"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "checklist"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "artifacts"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "logs", "session.log"),
			"session-started\nworkspace-smoke\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "checklist", "steps.txt"),
			"bootstrap\nverify-inputs\narchive-results\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "artifacts", "summary.json"),
			JSON.stringify(
				{
					status: "ready",
					createdBy: "workspace-smoke",
					steps: 3,
				},
				null,
				2,
			),
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "artifacts", "unexpected.txt"),
			"should not exist",
		);

		const result = await scoreGenerationInProcess(
			"workspace-smoke",
			"",
			5000,
			undefined,
			workspace.rootDir,
		);

		expect(result.failed).toBeGreaterThan(0);
		expect(
			result.details?.some(
				(detail) =>
					detail.name === "mutations.created exact match" && !detail.passed,
			),
		).toBe(true);
	});

	it("reports a clear error when file content mismatches", async () => {
		const workspace = await createWorkspace("workspace-smoke");
		await fs.promises.mkdir(path.join(workspace.rootDir, "logs"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "checklist"), {
			recursive: true,
		});
		await fs.promises.mkdir(path.join(workspace.rootDir, "artifacts"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "logs", "session.log"),
			"session-started\nwrong-value\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "checklist", "steps.txt"),
			"bootstrap\nverify-inputs\narchive-results\n",
		);
		await fs.promises.writeFile(
			path.join(workspace.rootDir, "artifacts", "summary.json"),
			JSON.stringify(
				{
					status: "ready",
					createdBy: "workspace-smoke",
					steps: 3,
				},
				null,
				2,
			),
		);

		const result = await scoreGenerationInProcess(
			"workspace-smoke",
			"",
			5000,
			undefined,
			workspace.rootDir,
		);

		expect(result.error).toContain('Content mismatch for "logs/session.log"');
	});
});
