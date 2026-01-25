/**
 * Purpose: OpenCode CLI adapter implementing the Harness interface.
 * Exports: createOpenCodeAdapter
 *
 * This adapter runs OpenCode via CLI using execa with --attach mode
 * to connect to a persistent server, avoiding cold boot overhead.
 *
 * Command: opencode run "<prompt>" --model ollama/<model> --attach <serverUrl>
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
const OPENCODE_PROMPT_PREFIX = `IMPORTANT: You are being used as a code generation tool for benchmarking.
- Do NOT use any file tools (Edit, Write, Bash) to create or modify files
- Do NOT create, read, or modify any files on disk
- Output your complete code solution directly in your response
- Use a markdown code block with the appropriate language tag (e.g., \`\`\`typescript)
- Include ONLY the code that solves the task - no extra examples or imports that aren't needed

Here is the task:

`;

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
			const args = ["run", fullPrompt, "--model", modelArg, "--attach", serverUrl];
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
