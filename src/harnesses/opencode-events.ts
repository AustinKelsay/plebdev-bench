/**
 * Purpose: Parse OpenCode JSON/JSONL event output into scorer-facing text.
 * Exports: OpenCodeEventParseMethod, OpenCodeParsedEvents, parseOpenCodeEvents
 *
 * Invariants:
 * - Boundary JSON is parsed through Zod-backed event shapes.
 * - Malformed output never throws; it falls back to raw text.
 * - Tool-call content is extracted only when a write-like payload carries code.
 */

import { z } from "zod";
import { isOpenCodePermissionDeniedText } from "./opencode-permissions.js";

/** Method used to derive scorer-facing output from OpenCode process text. */
export type OpenCodeEventParseMethod = "raw" | "json" | "tool_call";

/** Parsed OpenCode event stream plus diagnostics used by the adapter. */
export interface OpenCodeParsedEvents {
	/** Scorer-facing assistant/code text. */
	output: string;
	/** Extraction method. */
	method: OpenCodeEventParseMethod;
	/** True when at least one OpenCode protocol event parsed. */
	hasProtocolEvents: boolean;
	/** True when tool-use protocol events were observed. */
	hasToolUse: boolean;
	/** True when a tool error event was observed. */
	hasToolError: boolean;
	/** Best-effort tool error text. */
	toolErrorText?: string;
	/** True when events indicate a permission denial. */
	permissionDenied: boolean;
}

const OpenCodeEventSchema = z
	.object({
		type: z.string().optional(),
		text: z.string().optional(),
		toolCall: z.unknown().optional(),
		tool_call: z.unknown().optional(),
		toolCalls: z.unknown().optional(),
		tool_calls: z.unknown().optional(),
		part: z
			.object({
				type: z.string().optional(),
				text: z.string().optional(),
				delta: z.object({ text: z.string().optional() }).optional(),
				state: z
					.object({
						status: z.string().optional(),
						error: z.string().optional(),
					})
					.passthrough()
					.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

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

function buildParsedEvents(
	output: string,
	method: OpenCodeEventParseMethod,
	diagnostics: Partial<Omit<OpenCodeParsedEvents, "output" | "method">> = {},
): OpenCodeParsedEvents {
	return {
		output,
		method,
		hasProtocolEvents: diagnostics.hasProtocolEvents ?? method === "json",
		hasToolUse: diagnostics.hasToolUse ?? false,
		hasToolError: diagnostics.hasToolError ?? false,
		...(diagnostics.toolErrorText
			? { toolErrorText: diagnostics.toolErrorText }
			: {}),
		permissionDenied: diagnostics.permissionDenied ?? false,
	};
}

function stripMarkdownCodeBlock(text: string): string {
	const trimmed = text.trim();
	const match = trimmed.match(
		/^```(?:json|typescript|ts|javascript|js)?\n([\s\S]*?)\n?```$/,
	);
	return match?.[1]?.trim() ?? trimmed;
}

function extractContentFromArgs(args: Record<string, unknown>): string | null {
	const content =
		args.content ??
		args.contents ??
		args.text ??
		args.code ??
		args.file_text ??
		args.fileText ??
		args.file;

	return typeof content === "string" && content.trim().length > 0
		? content
		: null;
}

function extractFromToolCallObject(obj: unknown): string | null {
	const maxDepth = 4;
	const visit = (value: unknown, depth: number): string | null => {
		if (depth > maxDepth || !value) return null;
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
						const parsed = JSON.parse(argsValue) as unknown;
						if (typeof parsed === "object" && parsed !== null) {
							argsObj = parsed as Record<string, unknown>;
						}
					} catch {
						argsObj = null;
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

		for (const key of [
			"tool",
			"toolCall",
			"tool_call",
			"toolCalls",
			"tool_calls",
			"call",
			"data",
			"part",
			"delta",
		]) {
			if (key in record) {
				const found = visit(record[key], depth + 1);
				if (found) return found;
			}
		}
		return null;
	};

	return visit(obj, 0);
}

function extractFromToolCallText(text: string): string | null {
	const jsonText = stripMarkdownCodeBlock(text);
	try {
		return extractFromToolCallObject(JSON.parse(jsonText) as unknown);
	} catch {
		const contentMatch = jsonText.match(
			/"(?:content|contents|text|code)":\s*"([\s\S]*?)"\s*[,}]/,
		);
		if (!contentMatch?.[1]) return null;
		try {
			return JSON.parse(`"${contentMatch[1]}"`) as string;
		} catch {
			return contentMatch[1];
		}
	}
}

function readEventText(
	event: z.infer<typeof OpenCodeEventSchema>,
): string | undefined {
	return typeof event.part?.text === "string"
		? event.part.text
		: typeof event.part?.delta?.text === "string"
			? event.part.delta.text
			: typeof event.text === "string"
				? event.text
				: undefined;
}

/**
 * Parses OpenCode process output into assistant text or tool-call content.
 *
 * @param raw - Raw stdout/stderr payload from `opencode run`
 * @returns Parsed output and protocol diagnostics
 */
export function parseOpenCodeEvents(raw: string): OpenCodeParsedEvents {
	const trimmed = raw.trim();
	if (!trimmed) {
		return buildParsedEvents(raw, "raw", { hasProtocolEvents: false });
	}

	const textParts: string[] = [];
	let parsedLines = 0;
	let hasToolUse = false;
	let hasToolError = false;
	let toolErrorText: string | undefined;
	let permissionDenied = false;
	let toolCallOutput: string | null = null;

	for (const line of trimmed
		.split(/\r?\n/)
		.filter((candidate) => candidate.trim().length > 0)) {
		let parsedLine: unknown;
		try {
			parsedLine = JSON.parse(line) as unknown;
		} catch {
			continue;
		}

		const eventParse = OpenCodeEventSchema.safeParse(parsedLine);
		if (!eventParse.success) continue;
		const event = eventParse.data;
		parsedLines += 1;

		if (event.type?.includes("tool") || event.part?.type === "tool") {
			hasToolUse = true;
		}
		const stateError = event.part?.state?.error;
		const stateStatus = event.part?.state?.status;
		if (stateStatus === "error" || stateError) {
			hasToolError = true;
			toolErrorText ??= stateError ?? "OpenCode tool call failed";
			permissionDenied ||= stateError
				? isOpenCodePermissionDeniedText(stateError)
				: false;
		}

		toolCallOutput ??= extractFromToolCallObject(event);

		const text = readEventText(event);
		if (text) textParts.push(text);
	}

	const diagnostics = {
		hasProtocolEvents: parsedLines > 0,
		hasToolUse,
		hasToolError,
		toolErrorText,
		permissionDenied,
	};

	if (toolCallOutput) {
		return buildParsedEvents(toolCallOutput, "tool_call", diagnostics);
	}
	if (parsedLines > 0 && textParts.length > 0) {
		const combined = textParts.join("");
		const toolCallCode = extractFromToolCallText(combined);
		return buildParsedEvents(
			toolCallCode ?? combined,
			toolCallCode ? "tool_call" : "json",
			diagnostics,
		);
	}
	if (parsedLines > 0) {
		return buildParsedEvents("", "json", diagnostics);
	}

	const directToolCallCode = extractFromToolCallText(raw);
	if (directToolCallCode) {
		return buildParsedEvents(directToolCallCode, "tool_call", {
			hasProtocolEvents: false,
			hasToolUse: true,
		});
	}

	return buildParsedEvents(raw, "raw", { hasProtocolEvents: false });
}
