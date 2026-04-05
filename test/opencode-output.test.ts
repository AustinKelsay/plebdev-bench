/**
 * Purpose: Unit tests for OpenCode output normalization.
 * Exports: none
 *
 * Invariants:
 * - JSONL assistant output is preserved as assistant text
 * - Tool-call payloads extract code-bearing content
 * - Protocol-only JSONL does not leak raw transport events downstream
 */

import { describe, expect, it } from "vitest";
import { normalizeOpenCodeOutput } from "../src/harnesses/opencode-output.js";

describe("normalizeOpenCodeOutput", () => {
	it("extracts assistant text from JSONL events", () => {
		const normalized = normalizeOpenCodeOutput(
			[
				JSON.stringify({ type: "message", part: { text: "export " } }),
				JSON.stringify({
					type: "message",
					part: { delta: { text: "const answer = 42;" } },
				}),
			].join("\n"),
		);

		expect(normalized).toEqual({
			output: "export const answer = 42;",
			method: "json",
		});
	});

	it("extracts write-tool content from JSONL events", () => {
		const normalized = normalizeOpenCodeOutput(
			JSON.stringify({
				type: "tool_use",
				toolCall: {
					name: "write",
					arguments: {
						content: "export function createValue(): number { return 42; }",
					},
				},
			}),
		);

		expect(normalized).toEqual({
			output: "export function createValue(): number { return 42; }",
			method: "tool_call",
		});
	});

	it("returns empty normalized output for protocol-only JSONL", () => {
		const normalized = normalizeOpenCodeOutput(
			[
				JSON.stringify({ type: "step_start", sessionID: "abc" }),
				JSON.stringify({ type: "step_finish", sessionID: "abc" }),
			].join("\n"),
		);

		expect(normalized).toEqual({
			output: "",
			method: "json",
		});
	});

	it("preserves raw transcript-like strings for downstream taint detection", () => {
		expect(normalizeOpenCodeOutput("[Function bash]")).toEqual({
			output: "[Function bash]",
			method: "raw",
		});
		expect(normalizeOpenCodeOutput("read /tmp/workspace/src/index.ts")).toEqual({
			output: "read /tmp/workspace/src/index.ts",
			method: "raw",
		});
		expect(
			normalizeOpenCodeOutput('write{content:"x",filePath:"src/index.ts"}'),
		).toEqual({
			output: 'write{content:"x",filePath:"src/index.ts"}',
			method: "raw",
		});
	});
});
