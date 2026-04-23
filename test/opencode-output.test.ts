/**
 * Purpose: Unit tests for OpenCode event parsing.
 * Exports: none
 *
 * Invariants:
 * - JSONL assistant output is preserved as assistant text.
 * - Tool-call payloads extract code-bearing content.
 * - Protocol-only JSONL does not leak raw transport events downstream.
 */

import { describe, expect, it } from "vitest";
import { parseOpenCodeEvents } from "../src/harnesses/opencode-events.js";
import { isOpenCodePermissionDeniedText } from "../src/harnesses/opencode-permissions.js";

describe("parseOpenCodeEvents", () => {
	it("extracts assistant text from JSONL events", () => {
		const parsed = parseOpenCodeEvents(
			[
				JSON.stringify({ type: "message", part: { text: "export " } }),
				JSON.stringify({
					type: "message",
					part: { delta: { text: "const answer = 42;" } },
				}),
			].join("\n"),
		);

		expect(parsed).toEqual({
			output: "export const answer = 42;",
			method: "json",
			hasProtocolEvents: true,
			hasToolUse: false,
			hasToolError: false,
			permissionDenied: false,
		});
	});

	it("extracts write-tool content from JSONL events", () => {
		const parsed = parseOpenCodeEvents(
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

		expect(parsed).toEqual({
			output: "export function createValue(): number { return 42; }",
			method: "tool_call",
			hasProtocolEvents: true,
			hasToolUse: true,
			hasToolError: false,
			permissionDenied: false,
		});
	});

	it("returns empty parsed output for protocol-only JSONL", () => {
		const parsed = parseOpenCodeEvents(
			[
				JSON.stringify({ type: "step_start", sessionID: "abc" }),
				JSON.stringify({ type: "step_finish", sessionID: "abc" }),
			].join("\n"),
		);

		expect(parsed).toEqual({
			output: "",
			method: "json",
			hasProtocolEvents: true,
			hasToolUse: false,
			hasToolError: false,
			permissionDenied: false,
		});
	});

	it("preserves non-JSON text mixed with protocol-only JSONL", () => {
		const parsed = parseOpenCodeEvents(
			[
				JSON.stringify({ type: "step_start", sessionID: "abc" }),
				"export const answer = 42;",
				JSON.stringify({ type: "step_finish", sessionID: "abc" }),
			].join("\n"),
		);

		expect(parsed).toEqual({
			output: [
				JSON.stringify({ type: "step_start", sessionID: "abc" }),
				"export const answer = 42;",
				JSON.stringify({ type: "step_finish", sessionID: "abc" }),
			].join("\n"),
			method: "raw",
			hasProtocolEvents: true,
			hasToolUse: false,
			hasToolError: false,
			permissionDenied: false,
		});
	});

	it("preserves raw transcript-like strings for downstream taint detection", () => {
		expect(parseOpenCodeEvents("[Function bash]")).toEqual({
			output: "[Function bash]",
			method: "raw",
			hasProtocolEvents: false,
			hasToolUse: false,
			hasToolError: false,
			permissionDenied: false,
		});
		expect(parseOpenCodeEvents("read /tmp/workspace/src/index.ts")).toEqual({
			output: "read /tmp/workspace/src/index.ts",
			method: "raw",
			hasProtocolEvents: false,
			hasToolUse: false,
			hasToolError: false,
			permissionDenied: false,
		});
	});

	it("marks permission-denied tool events", () => {
		const parsed = parseOpenCodeEvents(
			JSON.stringify({
				type: "tool_use",
				part: {
					type: "tool",
					state: {
						status: "error",
						error: "permission denied: external_directory",
					},
				},
			}),
		);

		expect(parsed).toMatchObject({
			output: "",
			method: "json",
			hasProtocolEvents: true,
			hasToolUse: true,
			hasToolError: true,
			toolErrorText: "permission denied: external_directory",
			permissionDenied: true,
		});
	});
});

describe("isOpenCodePermissionDeniedText", () => {
	it("matches denial language without matching benign permission mentions", () => {
		expect(isOpenCodePermissionDeniedText("permission denied")).toBe(true);
		expect(isOpenCodePermissionDeniedText("access denied")).toBe(true);
		expect(
			isOpenCodePermissionDeniedText(
				"permission requested: external_directory (/tmp/foo); auto-rejecting",
			),
		).toBe(true);
		expect(isOpenCodePermissionDeniedText("permission requested")).toBe(false);
		expect(isOpenCodePermissionDeniedText("external_directory")).toBe(false);
	});
});
