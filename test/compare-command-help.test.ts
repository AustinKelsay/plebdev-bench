/**
 * Purpose: Validate compare-command help text uses glossary language.
 * Exports: none
 *
 * Invariants:
 * - Help text is a public CLI interface.
 * - Compatibility explanations should use Run Comparison terminology.
 */

import { describe, expect, it } from "vitest";
import { compareCommand } from "../src/cli/compare-command.js";

describe("compare command help", () => {
	it("describes Run Comparison compatibility using canonical terms", () => {
		const helpText = compareCommand.helpInformation();

		expect(helpText).toContain("Run Comparison");
		expect(helpText).toContain("Compatible Run Results");
		expect(helpText).toContain("Benchmark Checkpoint");
		expect(helpText).not.toMatch(/\bCompare two benchmark runs\b/);
	});
});
