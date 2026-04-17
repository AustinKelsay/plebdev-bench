/**
 * Purpose: Verify workspace tool prompts anchor the harness to the intended workspace root.
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
});
