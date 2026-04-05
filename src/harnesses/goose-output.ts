/**
 * Purpose: Normalize Goose CLI output into a single code-bearing text payload.
 * Exports: normalizeGooseOutput
 *
 * Goose outputs either:
 * - JSON payloads containing assistant message text, or
 * - plain text (stdout/stderr), or
 * - tool-call-like payloads (JSON) when the model emits a tool call directly.
 *
 * This module treats all Goose output as untrusted boundary input:
 * - JSON parsing is guarded and schema-validated with Zod
 * - Tool-call extraction is best-effort and should not throw
 *
 * Invariants:
 * - Never throws on malformed JSON; returns { method: "raw" } fallbacks
 * - Returns a single string intended for scoring/code extraction
 */

import { z } from "zod";

export type GooseNormalizeMethod = "raw" | "json" | "file_text" | "tool_call";

export interface GooseNormalizedOutput {
	output: string;
	method: GooseNormalizeMethod;
}

const GoosePayloadSchema = z
	.object({
		messages: z
			.array(
				z
					.object({
						role: z.string().optional(),
						content: z
							.array(z.object({ text: z.string().optional() }).passthrough())
							.optional(),
					})
					.passthrough(),
			)
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

/**
 * Decode common escape sequences from tool-call text blocks.
 *
 * @param text - Escaped string content
 * @returns Decoded string
 */
function decodeEscapedText(text: string): string {
	return (
		text
			// Unescape backslashes first so sequences like "\\n" decode correctly.
			.replace(/\\\\/g, "\\")
			.replace(/\\r/g, "\r")
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
	);
}

/**
 * Extracts file_text from loose text_editor output (non-JSON).
 *
 * @param text - Raw tool call text
 * @returns Extracted code or null
 */
function extractFromLooseTextEditor(text: string): string | null {
	const match = text.match(/file_text:\s*"([\s\S]*?)"\s*$/m);
	if (!match?.[1]) return null;
	const decoded = decodeEscapedText(match[1]);
	return decoded.trim().length > 0 ? decoded : null;
}

/**
 * Extracts code from Goose tool-call markup if present.
 *
 * @param content - Assistant text content
 * @returns Extracted code or null if not found
 */
function extractGooseFileText(content: string): string | null {
	const matches = Array.from(
		content.matchAll(/<parameter=file_text>\s*([\s\S]*?)\s*<\/parameter>/g),
	);

	if (matches.length === 0) {
		return null;
	}

	const chunks = matches
		.map((match) => match[1]?.trim())
		.filter((chunk): chunk is string => Boolean(chunk));

	return chunks.length > 0 ? chunks.join("\n\n") : null;
}

/**
 * Extracts code from a tool call JSON object.
 * Handles cases where the model emits a tool call directly instead of Goose executing it.
 *
 * @param text - Text that might be JSON tool call (possibly wrapped in markdown)
 * @returns Extracted code or null
 */
function extractFromToolCall(text: string): string | null {
	const jsonText = stripMarkdownCodeBlock(text);

	try {
		const parsed = JSON.parse(jsonText) as unknown;

		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}

		const obj = parsed as Record<string, unknown>;
		const hasArgsObject = (value: unknown): value is Record<string, unknown> =>
			typeof value === "object" && value !== null;

		// Handle direct text_editor payload: { type: "text_editor", file_text: "..." }
		if (obj.type === "text_editor" && typeof obj.file_text === "string") {
			const fileText = obj.file_text.trim();
			return fileText.length > 0 ? fileText : null;
		}

		// Handle direct tool call format: { name: "developer__text_editor", arguments: { file_text: "..." } }
		if (obj.name === "developer__text_editor" && hasArgsObject(obj.arguments)) {
			const args = obj.arguments;
			const fileText =
				typeof args.file_text === "string"
					? args.file_text
					: typeof args.fileText === "string"
						? args.fileText
						: undefined;
			if (typeof fileText === "string" && fileText.trim().length > 0) {
				// JSON.parse already decodes escape sequences correctly.
				return fileText;
			}
		}

		// Handle text_editor call: { name: "text_editor", arguments: { file_text: "..." } }
		if (obj.name === "text_editor" && hasArgsObject(obj.arguments)) {
			const args = obj.arguments;
			const fileText =
				typeof args.file_text === "string"
					? args.file_text
					: typeof args.fileText === "string"
						? args.fileText
						: typeof args.content === "string"
							? args.content
							: undefined;
			if (typeof fileText === "string" && fileText.trim().length > 0) {
				return fileText;
			}
		}

		// Handle { tool: "text_editor", arguments: { content: "..." } } format
		if (obj.tool === "text_editor" && hasArgsObject(obj.arguments)) {
			const args = obj.arguments;
			const content = args.content ?? args.file_text ?? args.fileText;
			if (typeof content === "string" && content.trim().length > 0) {
				return content;
			}
		}
	} catch {
		const loose = extractFromLooseTextEditor(jsonText);
		if (loose) return loose;
		return null;
	}

	return null;
}

function parseGooseJsonPayload(
	raw: string,
): z.infer<typeof GoosePayloadSchema> | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const candidates = new Set<string>([trimmed]);
	const firstBrace = trimmed.indexOf("{");
	const lastBrace = trimmed.lastIndexOf("}");

	if (firstBrace >= 0) {
		candidates.add(trimmed.slice(firstBrace));
	}
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			const result = GoosePayloadSchema.safeParse(parsed);
			if (result.success) {
				return result.data;
			}
		} catch {
			// Continue trying other candidate slices.
		}
	}

	return null;
}

/**
 * Normalizes Goose JSON output into plain assistant text or extracted code.
 *
 * @param raw - Raw stdout from Goose
 * @returns Normalized output and method indicator
 */
export function normalizeGooseOutput(raw: string): GooseNormalizedOutput {
	// First, try direct tool call extraction (might be raw JSON or markdown-wrapped JSON)
	const directToolCallCode = extractFromToolCall(raw);
	if (directToolCallCode) {
		return { output: directToolCallCode, method: "tool_call" };
	}

	const parsed = parseGooseJsonPayload(raw);
	if (parsed !== null) {
		const messages = parsed.messages ?? [];
		const assistantParts: string[] = [];

		for (const message of messages) {
			if (message.role !== "assistant") {
				continue;
			}
			const parts = message.content ?? [];
			for (const part of parts) {
				if (typeof part.text === "string") {
					assistantParts.push(part.text);
				}
			}
		}

		if (assistantParts.length === 0) {
			return { output: "", method: "json" };
		}

		const assistantText = assistantParts.join("");

		// Try to extract tool call from assistant text (might be markdown-wrapped JSON)
		const toolCallCode = extractFromToolCall(assistantText);
		if (toolCallCode) {
			return { output: toolCallCode, method: "tool_call" };
		}

		// Try to extract from file_text markup
		const fileText = extractGooseFileText(assistantText);
		if (fileText) {
			return { output: fileText, method: "file_text" };
		}

		return { output: assistantText, method: "json" };
	}

	return { output: raw, method: "raw" };
}
