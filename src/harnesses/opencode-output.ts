/**
 * Purpose: Normalize OpenCode CLI output into a single code-bearing text payload.
 * Exports: normalizeOpenCodeOutput
 *
 * OpenCode's `--format json` outputs JSONL streaming events. This module:
 * - Parses JSONL defensively (boundary input)
 * - Extracts assistant text from common event shapes
 * - Detects and extracts tool-call content when the model emits tool events
 *
 * Invariants:
 * - Never throws on malformed output; falls back to `{ method: "raw" }`
 * - Returned `output` is intended for downstream code extraction/scoring
 */

import { z } from "zod";

export type OpenCodeNormalizeMethod = "raw" | "json" | "tool_call";

export interface OpenCodeNormalizedOutput {
	output: string;
	method: OpenCodeNormalizeMethod;
}

const OpenCodeEventSchema = z
	.object({
		type: z.string().optional(),
		text: z.string().optional(),
		part: z
			.object({
				type: z.string().optional(),
				text: z.string().optional(),
				delta: z
					.object({
						text: z.string().optional(),
					})
					.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

/**
 * Strips markdown code block wrappers from text.
 *
 * @param text - Text that might be wrapped in ```json or ``` blocks
 * @returns Unwrapped text
 */
function stripMarkdownCodeBlock(text: string): string {
	const trimmed = text.trim();
	const match = trimmed.match(
		/^```(?:json|typescript|ts|javascript|js)?\n([\s\S]*?)\n?```$/,
	);
	if (match) {
		return match[1].trim();
	}
	return trimmed;
}

const WRITE_TOOL_NAMES = new Set([
	"edit",
	"write",
	"writefile",
	"write_file",
	"create_file",
	"createfile",
	"text_editor",
	"developer__text_editor",
]);

function extractContentFromArgs(args: Record<string, unknown>): string | null {
	const content =
		args.content ??
		args.contents ??
		args.text ??
		args.code ??
		args.file_text ??
		args.fileText ??
		args.file;

	if (typeof content === "string" && content.trim().length > 0) {
		return content;
	}

	return null;
}

function extractFromToolCallObject(obj: unknown): string | null {
	const MAX_DEPTH = 4;

	const visit = (value: unknown, depth: number): string | null => {
		if (depth > MAX_DEPTH || !value) return null;

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = visit(item, depth + 1);
				if (found) return found;
			}
			return null;
		}

		if (typeof value !== "object") return null;
		const record = value as Record<string, unknown>;

		const nameValue =
			typeof record.name === "string"
				? record.name
				: typeof record.toolName === "string"
					? record.toolName
					: undefined;
		const argsValue =
			record.arguments ?? record.args ?? record.parameters ?? record.input;

		if (nameValue && argsValue) {
			const toolName = nameValue.toLowerCase();
			if (WRITE_TOOL_NAMES.has(toolName)) {
				let argsObj: Record<string, unknown> | null = null;
				if (typeof argsValue === "string") {
					try {
						const parsedArgs = JSON.parse(argsValue) as unknown;
						if (typeof parsedArgs === "object" && parsedArgs !== null) {
							argsObj = parsedArgs as Record<string, unknown>;
						}
					} catch {
						// ignore
					}
				} else if (typeof argsValue === "object" && argsValue !== null) {
					argsObj = argsValue as Record<string, unknown>;
				}

				if (argsObj) {
					const content = extractContentFromArgs(argsObj);
					if (content) return content;
				}
			}
		}

		const nestedKeys = [
			"tool",
			"toolCall",
			"tool_call",
			"toolCalls",
			"tool_calls",
			"call",
			"data",
			"part",
			"delta",
		];

		for (const key of nestedKeys) {
			if (key in record) {
				const found = visit(record[key], depth + 1);
				if (found) return found;
			}
		}

		return null;
	};

	return visit(obj, 0);
}

function extractFromToolCall(text: string): string | null {
	const jsonText = stripMarkdownCodeBlock(text);

	try {
		const parsed = JSON.parse(jsonText) as unknown;
		const extracted = extractFromToolCallObject(parsed);
		if (extracted) return extracted;
	} catch {
		const contentMatch = jsonText.match(
			/"(?:content|contents|text|code)":\s*[`"]([\s\S]*?)[`"]\s*[,}]/,
		);
		if (contentMatch?.[1]) {
			const rawContent = contentMatch[1];
			let content = rawContent;
			try {
				// Decode escapes via JSON rules (avoid ad-hoc replacements that can corrupt code).
				const jsonString = `"${rawContent.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`;
				content = JSON.parse(jsonString) as string;
			} catch {
				// Keep raw when decode fails.
			}
			if (content.trim().length > 0) {
				return content;
			}
		}
		return null;
	}

	return null;
}

/**
 * Normalize OpenCode JSON/JSONL output into plain assistant text or extracted tool-call code.
 *
 * @param raw - Raw stdout/stderr from OpenCode
 * @returns Normalized output and method indicator
 */
export function normalizeOpenCodeOutput(raw: string): OpenCodeNormalizedOutput {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { output: raw, method: "raw" };
	}

	const textParts: string[] = [];
	let parsedLines = 0;

	const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
	let toolCallOutput: string | null = null;
	for (const line of lines) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			continue;
		}

		const event = OpenCodeEventSchema.safeParse(parsed);
		if (!event.success) {
			continue;
		}

		parsedLines += 1;
		const obj = event.data;

		if (!toolCallOutput) {
			const toolCallCode = extractFromToolCallObject(obj);
			if (toolCallCode) {
				toolCallOutput = toolCallCode;
			}
		}

		const text =
			typeof obj.part?.text === "string"
				? obj.part.text
				: typeof obj.part?.delta?.text === "string"
					? obj.part.delta.text
					: typeof obj.text === "string"
						? obj.text
						: undefined;

		if (typeof text === "string" && text.length > 0) {
			textParts.push(text);
		}
	}

	if (toolCallOutput) {
		return { output: toolCallOutput, method: "tool_call" };
	}

	if (parsedLines > 0 && textParts.length > 0) {
		const combined = textParts.join("");
		const toolCallCode = extractFromToolCall(combined);
		if (toolCallCode) {
			return { output: toolCallCode, method: "tool_call" };
		}
		return { output: combined, method: "json" };
	}

	// Fallback: single JSON object
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		const event = OpenCodeEventSchema.safeParse(parsed);
		if (event.success) {
			const obj = event.data;
			const toolCallCode = extractFromToolCallObject(obj);
			if (toolCallCode) {
				return { output: toolCallCode, method: "tool_call" };
			}
			const text =
				typeof obj.part?.text === "string"
					? obj.part.text
					: typeof obj.part?.delta?.text === "string"
						? obj.part.delta.text
						: typeof obj.text === "string"
							? obj.text
							: undefined;
			if (typeof text === "string" && text.length > 0) {
				const toolCallCode = extractFromToolCall(text);
				if (toolCallCode) {
					return { output: toolCallCode, method: "tool_call" };
				}
				return { output: text, method: "json" };
			}
		}
	} catch {
		// ignore
	}

	const directToolCallCode = extractFromToolCall(raw);
	if (directToolCallCode) {
		return { output: directToolCallCode, method: "tool_call" };
	}

	return { output: raw, method: "raw" };
}
