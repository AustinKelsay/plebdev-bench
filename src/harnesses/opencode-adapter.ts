/**
 * Purpose: OpenCode CLI adapter implementing the Harness interface.
 * Exports: createOpenCodeAdapter
 *
 * This adapter runs OpenCode via CLI using execa with --attach mode
 * to connect to a persistent server, avoiding cold boot overhead.
 *
 * Command: opencode run "<prompt>" --model ollama/<model> --attach <serverUrl> --format json
 *
 * Invariants:
 * - Uses Ollama as the backend provider
 * - Model discovery is delegated to Ollama adapter
 * - Server lifecycle managed by opencode-server.ts
 * - Timeout handled via execa options
 * - Empty/short output throws error (fail-fast)
 */

import { execa } from "execa";
import type { Harness, GenerateOpts, GenerateResult, ModelInfo } from "./harness.js";
import { createOllamaAdapter } from "./ollama-adapter.js";
import { logger } from "../lib/logger.js";
import { ensureServerRunning } from "./opencode-server.js";
import { extractCode } from "../lib/code-extractor.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/**
 * Prompt prefix for OpenCode to ensure code is output directly.
 *
 * OpenCode runs in "agent mode" and by default writes code to files using
 * the Edit tool. This prefix instructs it to output code directly in the
 * response instead, which allows the harness to capture the generated code.
 */
const OPENCODE_PROMPT_PREFIX = `You are generating code for an automated benchmark.
- Do not use tools or read/write files.
- Output only a single TypeScript module as plain text (optionally one \`\`\`ts\`\`\` block).
- No explanations.

Task:

`;

/**
 * Normalize OpenCode JSON/JSONL output into plain assistant text.
 *
 * @param raw - Raw stdout/stderr from OpenCode
 * @returns Normalized output and method indicator
 */
function normalizeOpenCodeOutput(raw: string): { output: string; method: "raw" | "json" } {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { output: raw, method: "raw" };
	}

	const textParts: string[] = [];
	let parsedLines = 0;

	const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as {
				type?: string;
				text?: string;
				part?: { type?: string; text?: string; delta?: { text?: string } };
			};

			parsedLines += 1;

			const part = obj.part ?? obj;
			const text =
				typeof part.text === "string"
					? part.text
					: typeof part.delta?.text === "string"
						? part.delta.text
						: typeof obj.text === "string"
							? obj.text
							: undefined;

			if (typeof text === "string" && text.length > 0) {
				textParts.push(text);
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	if (parsedLines > 0 && textParts.length > 0) {
		return { output: textParts.join(""), method: "json" };
	}

	// Fallback: try parsing as a single JSON object
	try {
		const obj = JSON.parse(trimmed) as {
			text?: string;
			part?: { text?: string; delta?: { text?: string } };
		};
		const text =
			typeof obj.part?.text === "string"
				? obj.part.text
				: typeof obj.part?.delta?.text === "string"
					? obj.part.delta.text
					: typeof obj.text === "string"
						? obj.text
						: undefined;
		if (typeof text === "string" && text.length > 0) {
			return { output: text, method: "json" };
		}
	} catch {
		// Ignore parse failures
	}

	return { output: raw, method: "raw" };
}

/** Configuration for the OpenCode adapter. */
export interface OpenCodeAdapterConfig {
	/** Ollama API base URL for model discovery. */
	ollamaBaseUrl: string;
	/** Default timeout for requests in milliseconds. */
	defaultTimeoutMs: number;
}

/**
 * Creates an OpenCode harness adapter.
 *
 * @param config - Adapter configuration
 * @returns Harness instance for OpenCode
 */
export function createOpenCodeAdapter(config: OpenCodeAdapterConfig): Harness {
	const { ollamaBaseUrl, defaultTimeoutMs } = config;

	// Use Ollama adapter for model discovery and ping
	const ollamaAdapter = createOllamaAdapter({
		baseUrl: ollamaBaseUrl,
		defaultTimeoutMs,
	});

	return {
		name: "opencode" as const,

		async ping(): Promise<boolean> {
			try {
				// Check if opencode CLI is available
				await execa("which", ["opencode"], { timeout: 5000 });
				// Also check if Ollama is available (required backend)
				return await ollamaAdapter.ping();
			} catch {
				return false;
			}
		},

		async listModels(): Promise<string[]> {
			// All harnesses use Ollama models
			return ollamaAdapter.listModels();
		},

		async getModelInfo(model: string): Promise<ModelInfo> {
			// Delegate to Ollama adapter
			return ollamaAdapter.getModelInfo(model);
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const log = logger.child({ harness: "opencode", model: opts.model });
			const startTime = performance.now();

			// Ensure server is running (starts on first call, reuses after)
			const serverUrl = await ensureServerRunning();

			// Model in ollama/model format
			const modelArg = `ollama/${opts.model}`;

			// Environment (minimal - most config is on server)
			const env = {
				...process.env,
				OPENCODE_DISABLE_AUTOUPDATE: "true",
			};

			// Prepend instruction prefix to ensure code is output directly
			// (OpenCode defaults to writing files via Edit tool)
			const fullPrompt = OPENCODE_PROMPT_PREFIX + opts.prompt;

			// Use --attach to connect to running server (avoids cold boot)
			// --format json provides structured output for reliable parsing
			const args = [
				"run",
				fullPrompt,
				"--model", modelArg,
				"--attach", serverUrl,
				"--format", "json",
			];
			log.debug(
				{ model: modelArg, serverUrl },
				"Executing OpenCode command with --attach",
			);

			try {
				// Run in temp directory to avoid codebase scanning overhead
				const tmpDir = process.env.TMPDIR || "/tmp";

				const result = await execa("opencode", args, {
					env,
					timeout: opts.timeoutMs,
					reject: true,
					cwd: tmpDir,
					// Prevent any stdin waiting/interaction
					stdin: "ignore",
					// Force kill with SIGKILL after 5s if SIGTERM doesn't work
					// (OpenCode's --attach mode can hang waiting on server)
					forceKillAfterDelay: 5000,
				});

				const durationMs = Math.round(performance.now() - startTime);

				// Log stderr if present (may contain warnings)
				if (result.stderr && result.stderr.trim()) {
					log.warn({ stderr: result.stderr.slice(0, 500) }, "OpenCode produced stderr");
				}

				log.debug(
					{ durationMs, outputLength: result.stdout.length, exitCode: result.exitCode },
					"OpenCode completed",
				);

				// Use raw stdout directly (simpler and more reliable)
				let output = result.stdout;

				// Fallback to stderr if stdout empty (OpenCode sometimes writes there)
				if (!output || output.trim().length === 0) {
					const stderrContent = result.stderr?.trim() || "";
					if (stderrContent.length >= MIN_OUTPUT_LENGTH) {
						log.info({ stderrUsed: true, length: stderrContent.length }, "Using stderr output (stdout was empty)");
						output = stderrContent;
					}
				}

				const normalized = normalizeOpenCodeOutput(output);
				if (normalized.method !== "raw") {
					log.debug(
						{ method: normalized.method, originalLength: output.length, normalizedLength: normalized.output.length },
						"Normalized OpenCode output",
					);
					output = normalized.output;
				}

				// Validate output is not empty
				if (!output || output.trim().length === 0) {
					// Fast empty responses often indicate server-side errors (e.g., model not found)
					// that don't propagate in --attach mode
					if (durationMs < 2000) {
						throw new Error(
							`OpenCode returned empty output instantly (${durationMs}ms) - model "${opts.model}" may not be recognized by OpenCode`,
						);
					}
					throw new Error("OpenCode returned empty output - model may not have run");
				}

				// Validate output is not too short
				if (output.trim().length < MIN_OUTPUT_LENGTH) {
					throw new Error(
						`OpenCode output too short (${output.trim().length} chars) - may indicate failure`,
					);
				}

				// OpenCode runs in "agent mode" and outputs tool interaction logs
				// (Todo, Glob, Bash, Read, Edit, etc.) mixed with actual code.
				// Extract the actual code blocks from the agent output.
				const extracted = extractCode(output);
				if (extracted.method !== "raw") {
					log.debug(
						{ method: extracted.method, originalLength: output.length, extractedLength: extracted.code.length },
						"Extracted code from OpenCode agent output",
					);
					output = extracted.code;
				}

				return {
					output,
					durationMs,
					// OpenCode doesn't provide token counts
				};
			} catch (error) {
				const durationMs = Math.round(performance.now() - startTime);

				// Check if it's a timeout error
				if (
					error instanceof Error &&
					error.message.includes("timed out")
				) {
					throw new Error(
						`OpenCode timed out after ${Math.round(opts.timeoutMs / 1000)}s. Try increasing --timeout.`,
					);
				}

				// Check for execa error with stderr
				if (error && typeof error === "object" && "stderr" in error) {
					const execaError = error as { stderr: string; message: string };
					throw new Error(
						`OpenCode failed: ${execaError.stderr || execaError.message}`,
					);
				}

				throw error;
			}
		},
	};
}
