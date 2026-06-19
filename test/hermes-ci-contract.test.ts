/**
 * Purpose: Verify documented CI expectations for optional Hermes integration.
 * Exports: none
 *
 * Invariants:
 * - Generic CI remains deterministic without Hermes, Ollama, or real model runs.
 * - Real Hermes smoke validation is documented as an explicit optional job.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Hermes CI contract documentation", () => {
	it("documents generic CI without Hermes and optional Hermes smoke validation", () => {
		const readme = fs.readFileSync(
			path.join(process.cwd(), "README.md"),
			"utf-8",
		);

		expect(readme).toContain("### CI and Optional Harnesses");
		expect(readme).toContain("Hermes is optional for generic CI");
		expect(readme).toContain("Generic CI must run without Hermes installed");
		expect(readme).toContain("Optional Hermes smoke");
		expect(readme).toContain("--harnesses hermes");
		expect(readme).toContain("Hermes CLI not installed");
		expect(readme).toContain("Hermes probe failed");
	});
});
