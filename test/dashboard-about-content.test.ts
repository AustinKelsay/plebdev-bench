/**
 * Purpose: Validate dashboard About content uses canonical benchmark glossary terms.
 * Exports: none
 *
 * Invariants:
 * - About content should connect dashboard users to the domain glossary.
 * - Tests assert public content contracts, not component implementation details.
 */

import { describe, expect, it } from "vitest";
import {
	aboutFacts,
	artifactRows,
	benchmarkDimensions,
	checkpointNotes,
	scoringSystems,
	workflowSteps,
} from "../apps/dashboard/src/components/about/about-content.js";

function flattenText(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map(flattenText).join("\n");
	}
	if (value && typeof value === "object") {
		return Object.values(value).map(flattenText).join("\n");
	}
	return typeof value === "string" ? value : "";
}

describe("dashboard About content glossary alignment", () => {
	it("uses canonical terms for benchmark artifacts, dimensions, and evidence", () => {
		const content = flattenText([
			aboutFacts,
			benchmarkDimensions,
			workflowSteps,
			scoringSystems,
			artifactRows,
			checkpointNotes,
		]);

		expect(content).toContain("Pass Type");
		expect(content).toContain("Run Plan");
		expect(content).toContain("Run Result");
		expect(content).toContain("Partial Run Result");
		expect(content).toContain("Benchmark Evidence");
		expect(content).toContain("Output Contract");
		expect(content).toContain("Compatible Run Results");
		expect(content).toContain("Published Run");
		expect(content).toContain("Composite Score");
		expect(content).toContain("Benchmark Checkpoint");
		expect(content).toContain("Machine Profile");
		expect(content).toContain("Model Profile");
		expect(content).toContain("Runtime Model");
		expect(content).toContain("Automated Score");
		expect(content).toContain("Frontier Eval");
		expect(content).not.toMatch(/\bprompt mode\b/i);
		expect(content).not.toMatch(/\bpartial snapshots?\b/i);
		expect(content).not.toMatch(/\bcheckpoint hash\b/i);
	});
});
