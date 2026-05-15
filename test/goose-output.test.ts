/**
 * Purpose: Unit tests for Goose output normalization.
 * Exports: none
 *
 * Invariants:
 * - Assistant JSON payloads normalize to assistant text
 * - Tool-call JSON payloads extract code-bearing content
 * - Parsed payloads with no assistant artifact preserve diagnostic JSON
 */

import { describe, expect, it } from "vitest";
import { normalizeGooseOutput } from "../src/harnesses/goose-output.js";

describe("normalizeGooseOutput", () => {
	it("extracts assistant text from valid Goose JSON payloads", () => {
		const normalized = normalizeGooseOutput(
			JSON.stringify({
				messages: [
					{
						role: "assistant",
						content: [{ text: "export const answer = 42;" }],
					},
				],
			}),
		);

		expect(normalized).toEqual({
			output: "export const answer = 42;",
			method: "json",
		});
	});

	it("extracts direct tool-call JSON payloads", () => {
		const normalized = normalizeGooseOutput(
			JSON.stringify({
				name: "text_editor",
				arguments: {
					file_text: "export function createValue(): number { return 42; }",
				},
			}),
		);

		expect(normalized).toEqual({
			output: "export function createValue(): number { return 42; }",
			method: "tool_call",
		});
	});

	it("preserves turn-limit prompts from assistant JSON payloads", () => {
		const normalized = normalizeGooseOutput(
			JSON.stringify({
				messages: [
					{
						role: "assistant",
						content: [
							{
								text: "Would you like me to continue? I reached the maximum number of actions without user input.",
							},
						],
					},
				],
			}),
		);

		expect(normalized).toEqual({
			output:
				"Would you like me to continue? I reached the maximum number of actions without user input.",
			method: "json",
		});
	});

	it("preserves parsed status-only payloads for diagnostics", () => {
		const raw = JSON.stringify({
			messages: [
				{
					role: "system",
					content: [{ text: "still working" }],
				},
			],
		});
		const normalized = normalizeGooseOutput(raw);

		expect(normalized).toEqual({
			output: raw,
			method: "json",
		});
	});

	it("preserves bare status text as raw output", () => {
		expect(normalizeGooseOutput("DONE")).toEqual({
			output: "DONE",
			method: "raw",
		});
	});
});
