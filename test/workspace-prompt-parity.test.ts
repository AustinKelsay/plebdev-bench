/**
 * Purpose: Guard prompt/scoring parity for workspace benchmarks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Builds the absolute prompt path for a benchmark test.
 *
 * @param testName - Test directory name
 * @param passType - Prompt variant
 * @returns Absolute prompt file path
 */
function buildTestPromptPath(
	testName: string,
	passType: "blind" | "informed",
): string {
	return path.join(
		process.cwd(),
		"src",
		"tests",
		testName,
		`prompt.${passType}.md`,
	);
}

describe("workspace prompt parity", () => {
	it("file-locator informed prompt includes every scored JSON field", () => {
		const promptPath = buildTestPromptPath("file-locator", "informed");
		const prompt = fs.readFileSync(promptPath, "utf-8");

		expect(prompt).toContain("reports/found-values.json");
		expect(prompt).toContain("owner");
		expect(prompt).toContain("ticket");
		expect(prompt).toContain("version");
		expect(prompt).toContain('"sourceCount":3');
	});

	it("blind workspace prompts expose required parent-directory creation", () => {
		const fileDeletePrompt = fs.readFileSync(
			buildTestPromptPath("file-delete-smoke", "blind"),
			"utf-8",
		);
		const safeCleanupPrompt = fs.readFileSync(
			buildTestPromptPath("safe-cleanup", "blind"),
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
			buildTestPromptPath("calculator-stateful", "blind"),
			"utf-8",
		);
		const emitterPrompt = fs.readFileSync(
			buildTestPromptPath("event-emitter", "blind"),
			"utf-8",
		);
		const rateLimiterPrompt = fs.readFileSync(
			buildTestPromptPath("rate-limiter", "blind"),
			"utf-8",
		);

		expect(calculatorPrompt).toContain("`add(n: number)`");
		expect(calculatorPrompt).toContain("`subtract(n: number)`");
		expect(calculatorPrompt).toContain("`clear()`");
		expect(calculatorPrompt).toContain("`memoryClear`");
		expect(calculatorPrompt).toContain("`memoryRecall()`");
		expect(emitterPrompt).toContain("`listenerCount(event)`");
		expect(emitterPrompt).toContain("`on(event, listener)`");
		expect(emitterPrompt).toContain("`once(event, listener)`");
		expect(emitterPrompt).toContain("`off(event, listener)`");
		expect(emitterPrompt).toContain("`emit(event, payload)`");
		expect(rateLimiterPrompt).toContain("`allow(key: string, nowMs: number)`");
		expect(rateLimiterPrompt).toContain("`remaining(key: string, nowMs: number)`");
		expect(rateLimiterPrompt).toContain("`reset(key: string)`");
		expect(rateLimiterPrompt).toContain("never go below 0");
	});
});
