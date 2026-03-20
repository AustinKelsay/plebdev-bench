/**
 * Purpose: Guard prompt/scoring parity for workspace benchmarks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace prompt parity", () => {
	it("file-locator informed prompt includes every scored JSON field", () => {
		const promptPath = path.join(
			process.cwd(),
			"src",
			"tests",
			"file-locator",
			"prompt.informed.md",
		);
		const prompt = fs.readFileSync(promptPath, "utf-8");

		expect(prompt).toContain("reports/found-values.json");
		expect(prompt).toContain("owner");
		expect(prompt).toContain("ticket");
		expect(prompt).toContain("version");
		expect(prompt).toContain('"sourceCount":3');
	});
});
