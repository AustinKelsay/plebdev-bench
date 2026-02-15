/**
 * Purpose: Unit tests for harness code-output policy helpers.
 * Exports: (none)
 */

import { describe, expect, it } from "vitest";
import {
	appendRetryMarker,
	buildCodeOnlyPrompt,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "../src/harnesses/code-output-policy.js";

describe("evaluateCodeOnlyOutput", () => {
	it("accepts markdown TypeScript blocks", () => {
		const decision = evaluateCodeOnlyOutput(
			"```typescript\nexport function x(): number { return 1; }\n```",
			10,
		);
		expect(decision.shouldRetry).toBe(false);
		expect(decision.reason).toBe("ok");
		expect(decision.method).toBe("markdown-ts");
	});

	it("retries known off-task chatter", () => {
		const decision = evaluateCodeOnlyOutput(
			"Let me know how I can help you.",
			10,
		);
		expect(decision.shouldRetry).toBe(true);
		expect(decision.reason).toBe("off_task");
	});

	it("accepts raw code-like output", () => {
		const decision = evaluateCodeOnlyOutput(
			"export function createValue(): number { return 42; }",
			10,
		);
		expect(decision.shouldRetry).toBe(false);
		expect(decision.reason).toBe("ok");
	});

	it("retries short output", () => {
		const decision = evaluateCodeOnlyOutput("ok", 10);
		expect(decision.shouldRetry).toBe(true);
		expect(decision.reason).toBe("too_short");
	});

	it("retries suspicious todo-app near-miss patterns", () => {
		const decision = evaluateCodeOnlyOutput(
			`
export function createTodoApp() {
  const todos: { id: number }[] = [];
  return {
    deleteTodo() {
      todos.filter((t) => t.id !== 1);
    }
  };
}
`,
			10,
		);
		expect(decision.shouldRetry).toBe(true);
		expect(decision.reason).toBe("suspicious_code_pattern");
	});

	it("retries suspicious calculator-stateful memoryRecall mutation", () => {
		const decision = evaluateCodeOnlyOutput(
			`
export function createCalculator() {
  let currentValue = 0;
  let memoryValue = 0;
  return {
    memoryRecall() {
      currentValue = memoryValue;
      return currentValue;
    }
  };
}
`,
			10,
		);
		expect(decision.shouldRetry).toBe(true);
		expect(decision.reason).toBe("suspicious_code_pattern");
	});
});

describe("retry marker helpers", () => {
	it("appends and strips retry marker", () => {
		const prompt = "Build the solution.";
		expect(hasRetryMarker(prompt)).toBe(false);

		const marked = appendRetryMarker(prompt);
		expect(hasRetryMarker(marked)).toBe(true);
		expect(stripRetryMarker(marked)).toBe(prompt);
	});
});

describe("buildCodeOnlyPrompt", () => {
	it("adds strict contract and retry note", () => {
		const first = buildCodeOnlyPrompt("Write code", false);
		const retry = buildCodeOnlyPrompt("Write code", true);
		expect(first).toContain("Output contract:");
		expect(first).not.toContain("Previous output was unusable");
		expect(retry).toContain("Previous output was unusable");
	});

	it("adds todo-app specific constraints when createTodoApp is present", () => {
		const prompt = buildCodeOnlyPrompt(
			"Implement createTodoApp with CRUD methods.",
			false,
		);
		expect(prompt).toContain("For todo-app: export `createTodoApp`");
		expect(prompt).toContain("Keep all todo state inside `createTodoApp`");
		expect(prompt).toContain("Do not reassign `const` arrays");
	});

	it("adds calculator-stateful constraints when createCalculator is present", () => {
		const prompt = buildCodeOnlyPrompt(
			"Implement createCalculator with chainable operations.",
			false,
		);
		expect(prompt).toContain("For calculator-stateful");
		expect(prompt).toContain("must not mutate current calculator value");
	});
});
