/**
 * Purpose: Goose CLI adapter implementing the Harness interface.
 * Exports: createGooseAdapter
 *
 * This adapter runs Goose via CLI using execa.
 * Command: goose run --no-session --provider <provider> --model <model> -q --output-format json -i -
 * Prompt is passed via stdin and asks for final TypeScript code output.
 *
 * Invariants:
 * - Uses runtime.baseUrl for provider-specific API routing
 * - Timeout handled via execa options
 * - Tool output is optional; plain assistant output is still scored
 */

import { execa } from "execa";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { Harness, GenerateOpts, GenerateResult } from "./harness.js";
import { extractCode } from "../lib/code-extractor.js";
import { logger } from "../lib/logger.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/**
 * Normalizes an OpenAI-compatible base path for Goose.
 *
 * Goose expects OPENAI_HOST plus OPENAI_BASE_PATH that points to the API root,
 * not a specific endpoint. Ensure we default to "v1" and strip any
 * "/chat/completions" suffix if present.
 *
 * @param pathname - URL pathname (e.g., "/v1" or "/v1/chat/completions")
 * @returns Normalized base path (e.g., "v1")
 */
function normalizeOpenAiBasePath(pathname: string): string {
	const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!trimmed) return "v1";

	const suffix = "/chat/completions";
	const lower = trimmed.toLowerCase();
	if (lower.endsWith(suffix)) {
		const without = trimmed.slice(0, -suffix.length);
		return without.length > 0 ? without : "v1";
	}

	return trimmed;
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
 * Strips markdown code block wrappers from text.
 *
 * @param text - Text that might be wrapped in ```json or ``` blocks
 * @returns Unwrapped text
 */
function stripMarkdownCodeBlock(text: string): string {
	const trimmed = text.trim();
	// Match ```json, ```typescript, ```ts, or just ```
	const match = trimmed.match(/^```(?:json|typescript|ts|javascript|js)?\n([\s\S]*?)\n?```$/);
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
	return text
		.replace(/\\r/g, "\r")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");
}

/**
 * Extracts file_text from loose text_editor output (non-JSON).
 *
 * Example:
 * text_editor
 *   path: solution.ts
 *   command: write
 *   file_text: "..."
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
 * Extracts code from a tool call JSON object.
 * Handles cases where model outputs tool call directly instead of Goose executing it.
 *
 * @param text - Text that might be JSON tool call (possibly wrapped in markdown)
 * @returns Extracted code or null
 */
function extractFromToolCall(text: string): string | null {
	// Strip markdown code blocks if present
	const jsonText = stripMarkdownCodeBlock(text);

	try {
		const parsed = JSON.parse(jsonText) as unknown;

		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}

		const obj = parsed as Record<string, unknown>;

		// Handle direct text_editor payload: { type: "text_editor", file_text: "..." }
		if (obj.type === "text_editor" && typeof obj.file_text === "string") {
			const fileText = obj.file_text.trim();
			return fileText.length > 0 ? fileText : null;
		}

		// Handle direct tool call format: { name: "developer__text_editor", arguments: { file_text: "..." } }
		if (obj.name === "developer__text_editor" && typeof obj.arguments === "object") {
			const args = obj.arguments as Record<string, unknown>;
			const fileText =
				typeof args.file_text === "string"
					? args.file_text
					: typeof args.fileText === "string"
						? args.fileText
						: undefined;
			if (typeof fileText === "string" && fileText.trim().length > 0) {
				// JSON.parse already decodes escape sequences correctly.
				// Do NOT post-process - it would corrupt legitimate escapes in code
				// (e.g., regex patterns like /\n/ or string literals with "\n").
				return fileText;
			}
		}

		// Handle text_editor call: { name: "text_editor", arguments: { file_text: "..." } }
		if (obj.name === "text_editor" && typeof obj.arguments === "object") {
			const args = obj.arguments as Record<string, unknown>;
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
		if (obj.tool === "text_editor" && typeof obj.arguments === "object") {
			const args = obj.arguments as Record<string, unknown>;
			const content = args.content ?? args.file_text ?? args.fileText;
			if (typeof content === "string" && content.trim().length > 0) {
				return content;
			}
		}
	} catch {
		// Not valid JSON - try loose text_editor format
		const loose = extractFromLooseTextEditor(jsonText);
		if (loose) {
			return loose;
		}
		return null;
	}

	return null;
}

/**
 * Normalizes Goose JSON output into plain assistant text or extracted code.
 *
 * @param raw - Raw stdout from Goose
 * @returns Normalized output and method indicator
 */
function parseGooseJsonPayload(raw: string): unknown | null {
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
			return JSON.parse(candidate) as unknown;
		} catch {
			// Continue trying other candidate slices.
		}
	}

	return null;
}

function normalizeGooseOutput(raw: string): { output: string; method: "raw" | "json" | "file_text" | "tool_call" } {
	// First, try direct tool call extraction (might be raw JSON or markdown-wrapped JSON)
	const directToolCallCode = extractFromToolCall(raw);
	if (directToolCallCode) {
		return { output: directToolCallCode, method: "tool_call" };
	}

	const parsed = parseGooseJsonPayload(raw);
	if (parsed !== null) {

		// Check for standard Goose message format
		const messagesObj = parsed as {
			messages?: Array<{
				role?: string;
				content?: Array<{ text?: string }>;
			}>;
		};

		const messages = messagesObj.messages ?? [];
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
			return { output: raw, method: "raw" };
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

/**
 * Creates a Goose harness adapter.
 *
 * @returns Harness instance for Goose
 */
export function createGooseAdapter(): Harness {
	return {
		name: "goose" as const,

		async ping(): Promise<boolean> {
			try {
				// Check if goose CLI is available
				await execa("which", ["goose"], { timeout: 5000 });
				return true;
			} catch {
				return false;
			}
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const { runtime, model, prompt, timeoutMs } = opts;
			const log = logger.child({ harness: "goose", model });
			const startTime = performance.now();

			// Create unique temp directory for this generation
			const runId = crypto.randomBytes(8).toString("hex");
			const workDir = path.join(os.tmpdir(), `plebdev-bench-goose-${runId}`);
			const solutionPath = path.join(workDir, SOLUTION_FILENAME);
			const executionCwd = process.cwd();

			await fs.promises.mkdir(workDir, { recursive: true });
			log.debug({ workDir, executionCwd }, "Prepared Goose output directory");

			// Determine Goose provider and extra env based on runtime API format
			let provider: string;
			let extraEnv: Record<string, string> = {};

			switch (runtime.apiFormat) {
				case "ollama":
					provider = "ollama";
					break;
				case "openai-compat": {
					provider = "openai";

					const apiKey =
						process.env.VLLM_API_KEY ?? process.env.OPENAI_API_KEY;
					if (!apiKey) {
						log.warn(
							"No VLLM_API_KEY or OPENAI_API_KEY set; using dummy key for OpenAI-compatible provider",
						);
					}

					const parsedBaseUrl = new URL(runtime.baseUrl);
					const host = `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`;
					let basePath = normalizeOpenAiBasePath(parsedBaseUrl.pathname);
					// Goose's OpenAI provider sometimes hits /v1/completions by default.
					// vLLM only supports chat completions, so force the chat endpoint path.
					if (runtime.name === "vllm" && basePath === "v1") {
						basePath = "v1/chat/completions";
					}
					const baseUrl = `${host}/${basePath}`;

					extraEnv = {
						OPENAI_API_KEY: apiKey ?? "dummy",
						OPENAI_HOST: host,
						OPENAI_BASE_PATH: basePath,
						OPENAI_BASE_URL: baseUrl,
						OPENAI_API_BASE: baseUrl,
						OPENAI_MODEL: model,
						OPENAI_DEFAULT_MODEL: model,
					};
					break;
				}
			}

			// Set up environment for Goose (headless mode)
			const env = {
				...process.env,
				GOOSE_PROVIDER: provider,
				GOOSE_MODEL: model,
				...extraEnv,
			};

			// Keep prompt task-focused and require final code in response text.
			const fullPrompt = `${prompt.trim()}\n\nReturn the final TypeScript code in your response. Do not return status-only messages.`;

			// CRITICAL: Use --provider and --model flags to override Goose's config file
			const args = [
				"run",
				"--no-session",
				"--max-turns", "1",              // Keep Goose on a single completion turn
				"--provider", provider,           // Override config - use determined provider
				"--model", model,                 // Override config - use our model
				"--output-format", "json",        // Structured output for parsing
				"-i", "-",                        // Read prompt from stdin
			];
			log.debug(
				{ cmd: "goose", model, executionCwd, runtimeBaseUrl: runtime.baseUrl },
				"Executing Goose command",
			);

			try {
				const result = await execa("goose", args, {
					env,
					timeout: timeoutMs,
					reject: true,
					cwd: executionCwd,
					input: fullPrompt,
					// Force kill with SIGKILL after 5s if SIGTERM doesn't work
					forceKillAfterDelay: 5000,
				});

				const durationMs = Math.round(performance.now() - startTime);
				let output = result.stdout;
				const stderr = result.stderr?.trim() || "";

				// Log stderr if present (may contain warnings)
				if (stderr) {
					log.warn({ stderr: stderr.slice(0, 500) }, "Goose produced stderr");
				}

				// Fallback to stderr if stdout empty
				if (!output || output.trim().length === 0) {
					if (stderr.length >= MIN_OUTPUT_LENGTH) {
						log.info({ stderrUsed: true, length: stderr.length }, "Using stderr output (stdout was empty)");
						output = stderr;
					}
				}

				const normalized = normalizeGooseOutput(output);
				const toolCallDetected =
					normalized.method === "tool_call" || normalized.method === "file_text";
				if (normalized.method !== "raw") {
					log.debug(
						{ method: normalized.method, originalLength: output.length, normalizedLength: normalized.output.length },
						"Normalized Goose output",
					);
					output = normalized.output;
				}

				log.debug(
					{ durationMs, outputLength: output.length, exitCode: result.exitCode },
					"Goose completed",
				);

				// Check if solution file was created by tool
				let codeFilePath: string | undefined;
				if (fs.existsSync(solutionPath)) {
					const code = await fs.promises.readFile(solutionPath, "utf-8");
					if (code.trim().length >= MIN_OUTPUT_LENGTH) {
						codeFilePath = solutionPath;
						log.info({ codeFilePath, codeLength: code.length }, "Code written via developer tool");
					} else {
						log.warn({ codeLength: code.trim().length }, "solution.ts exists but is too short");
					}
				}

				// Fast empty responses often indicate server-side errors (e.g., model mismatch).
				if (!codeFilePath) {
					if (durationMs < 2000 && (!output || output.trim().length < MIN_OUTPUT_LENGTH)) {
						throw new Error(
							`Goose returned empty output instantly (${durationMs}ms) - model "${model}" may not be recognized`,
						);
					}

					const extracted = extractCode(output);
					const extractedCode = extracted.code.trim();
					if (
						extractedCode.length >= MIN_OUTPUT_LENGTH &&
						extracted.method !== "raw"
					) {
						await fs.promises.writeFile(solutionPath, extractedCode, "utf-8");
						codeFilePath = solutionPath;
						log.info(
							{
								codeFilePath,
								extractionMethod: extracted.method,
								codeLength: extractedCode.length,
								toolCallDetected,
							},
							"Persisted extracted code to solution.ts (tool output absent)",
						);
					} else {
						log.warn(
							{ toolCallDetected, outputLength: output.length, extractionMethod: extracted.method },
							"Goose finished without usable code output",
						);

						if (output.trim().length < MIN_OUTPUT_LENGTH) {
							const error = new Error(
								"Goose returned no usable output and did not produce code",
							);
							(error as { output?: string; durationMs?: number }).output = output;
							(error as { output?: string; durationMs?: number }).durationMs = durationMs;
							throw error;
						}
					}
				}

				return {
					output,
					durationMs,
					codeFilePath,
					// Goose doesn't provide token counts
				};
			} catch (error) {
				// Check if it's a timeout error
				if (
					error instanceof Error &&
					error.message.includes("timed out")
				) {
					throw new Error(
						`Goose timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
					);
				}

				// Check for execa error with stderr
				if (error && typeof error === "object" && "stderr" in error) {
					const execaError = error as { stderr: string; message: string };
					throw new Error(
						`Goose failed: ${execaError.stderr || execaError.message}`,
					);
				}

				throw error;
			} finally {
				// Clean up temp directory (best effort, but preserve if codeFilePath is set)
				// Note: cleanup happens after scoring reads the file
				// We leave cleanup to the caller/GC since the file needs to persist for scoring
			}
		},
	};
}
