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

	it("blind workspace prompts expose required parent-directory creation", () => {
		const fileDeletePrompt = fs.readFileSync(
			path.join(
				process.cwd(),
				"src",
				"tests",
				"file-delete-smoke",
				"prompt.blind.md",
			),
			"utf-8",
		);
		const safeCleanupPrompt = fs.readFileSync(
			path.join(
				process.cwd(),
				"src",
				"tests",
				"safe-cleanup",
				"prompt.blind.md",
			),
			"utf-8",
		);

		expect(fileDeletePrompt).toContain(
			"You may create the missing `reports/` directory",
		);
		expect(safeCleanupPrompt).toContain(
			"You may create the missing `reports/` directory",
		);
	});

	it("blind coding prompts declare the required public method contracts", () => {
		const calculatorPrompt = fs.readFileSync(
			path.join(
				process.cwd(),
				"src",
				"tests",
				"calculator-stateful",
				"prompt.blind.md",
			),
			"utf-8",
		);
		const emitterPrompt = fs.readFileSync(
			path.join(
				process.cwd(),
				"src",
				"tests",
				"event-emitter",
				"prompt.blind.md",
			),
			"utf-8",
		);
		const rateLimiterPrompt = fs.readFileSync(
			path.join(
				process.cwd(),
				"src",
				"tests",
				"rate-limiter",
				"prompt.blind.md",
			),
			"utf-8",
		);

		expect(calculatorPrompt).toContain("`add(n: number)`");
		expect(calculatorPrompt).toContain("`memoryRecall()`");
		expect(emitterPrompt).toContain("`listenerCount(event)`");
		expect(emitterPrompt).toContain("`on(event, listener)`");
		expect(emitterPrompt).toContain("`emit(event, payload)`");
		expect(rateLimiterPrompt).toContain("`allow(key: string, nowMs: number)`");
		expect(rateLimiterPrompt).toContain("`remaining(key: string, nowMs: number)`");
		expect(rateLimiterPrompt).toContain("never go below 0");
	});
});
