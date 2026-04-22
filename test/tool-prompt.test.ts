/**
 * Purpose: Verify workspace tool prompts anchor the harness to the intended workspace root.
 * Exports: none
 *
 * Invariants:
 * - Default workspace prompts include absolute anchor instructions when provided.
 * - Relative-only prompts omit absolute workspace paths.
 */

import { describe, expect, it } from "vitest";
import { buildWorkspaceToolPrompt } from "../src/harnesses/tool-prompt.js";

describe("buildWorkspaceToolPrompt", () => {
	it("includes the workspace root when provided", () => {
		const prompt = buildWorkspaceToolPrompt({
			toolNames: ["text_editor"],
			taskPrompt: "Update the fixture.",
			workspaceRootPath: "/tmp/fixture-root",
		});

		expect(prompt).toContain('Workspace root: "/tmp/fixture-root"');
		expect(prompt).toContain('Do not inspect "/" or parent directories.');
	});

	it("omits absolute workspace roots in relative-only mode", () => {
		const prompt = buildWorkspaceToolPrompt({
			toolNames: ["read", "grep", "write"],
			taskPrompt: "Find the config and write a report.",
			workspaceRootPath: "/tmp/fixture-root",
			pathMode: "relative-only",
			toolUsageHint: "Use grep before editing.",
		});

		expect(prompt).not.toContain("/tmp/fixture-root");
		expect(prompt).toContain(
			"- Use relative paths only. Do not pass absolute paths to tools.",
		);
		expect(prompt).toContain('- For searches, use path "." or "./".');
	});
});
