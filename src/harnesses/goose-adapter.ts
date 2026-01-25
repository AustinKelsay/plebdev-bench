/**
 * Purpose: Goose CLI adapter implementing the Harness interface.
 * Exports: createGooseAdapter
 *
 * This adapter runs Goose via CLI using execa.
 * Command: goose run --no-session --provider ollama --model <model> -q --output-format json -i -
 * Prompt is passed via stdin.
 *
 * Optimizations:
 * - Runs in temp directory to avoid codebase scanning
 * - Uses -q (quiet) mode to reduce output overhead
 * - Uses --output-format json for structured output
 * - Uses stdin for prompts (avoids shell escaping issues)
 *
 * Invariants:
 * - Uses Ollama as the backend provider
 * - Model discovery is delegated to Ollama adapter
 * - Timeout handled via execa options
 * - Empty/short output throws error (fail-fast)
 */

import { execa } from "execa";
import type { Harness, GenerateOpts, GenerateResult, ModelInfo } from "./harness.js";
import { createOllamaAdapter } from "./ollama-adapter.js";
import { logger } from "../lib/logger.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

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
 * Normalizes Goose JSON output into plain assistant text or extracted code.
 *
 * @param raw - Raw stdout from Goose
 * @returns Normalized output and method indicator
 */
function normalizeGooseOutput(raw: string): { output: string; method: "raw" | "json" | "file_text" } {
	try {
		const parsed = JSON.parse(raw) as {
			messages?: Array<{
				role?: string;
				content?: Array<{ text?: string }>;
			}>;
		};

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
			return { output: raw, method: "raw" };
		}

		const assistantText = assistantParts.join("");
		const fileText = extractGooseFileText(assistantText);
		if (fileText) {
			return { output: fileText, method: "file_text" };
		}

		return { output: assistantText, method: "json" };
	} catch {
		return { output: raw, method: "raw" };
	}
}

/** Configuration for the Goose adapter. */
export interface GooseAdapterConfig {
	/** Ollama API base URL for model discovery. */
	ollamaBaseUrl: string;
	/** Default timeout for requests in milliseconds. */
	defaultTimeoutMs: number;
}

/**
 * Creates a Goose harness adapter.
 *
 * @param config - Adapter configuration
 * @returns Harness instance for Goose
 */
export function createGooseAdapter(config: GooseAdapterConfig): Harness {
	const { ollamaBaseUrl, defaultTimeoutMs } = config;

	// Use Ollama adapter for model discovery and ping
	const ollamaAdapter = createOllamaAdapter({
		baseUrl: ollamaBaseUrl,
		defaultTimeoutMs,
	});

	return {
		name: "goose" as const,

		async ping(): Promise<boolean> {
			try {
				// Check if goose CLI is available
				await execa("which", ["goose"], { timeout: 5000 });
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
			const log = logger.child({ harness: "goose", model: opts.model });
			const startTime = performance.now();

			// Set up environment for Goose (headless mode)
			// Only documented env vars are kept (B.1 cleanup)
			const env = {
				...process.env,
				GOOSE_PROVIDER: "ollama",
				GOOSE_MODEL: opts.model,
				GOOSE_CLI_MIN_PRIORITY: "0.2",
			};

			// Optimized args: use quiet mode and JSON output (B.1 cleanup)
			// CRITICAL: Use --provider and --model flags to override Goose's config file
			const args = [
				"run",
				"--no-session",
				"--provider", "ollama",       // Override config - force Ollama
				"--model", opts.model,        // Override config - use our model
				"-q",                         // Quiet mode - faster output
				"--output-format", "json",    // Structured output for parsing
				"-i", "-",                    // Read prompt from stdin
			];
			log.debug(
				{ cmd: "goose", model: opts.model },
				"Executing Goose command",
			);

			// Run in temp directory to avoid codebase scanning
			const tmpDir = process.env.TMPDIR || "/tmp";

			try {
				const result = await execa("goose", args, {
					env,
					timeout: opts.timeoutMs,
					reject: true,
					cwd: tmpDir,
					input: opts.prompt, // Pass prompt via stdin (B.1 optimization)
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

				// Fallback to stderr if stdout empty (mirrors OpenCode behavior)
				if (!output || output.trim().length === 0) {
					if (stderr.length >= MIN_OUTPUT_LENGTH) {
						log.info({ stderrUsed: true, length: stderr.length }, "Using stderr output (stdout was empty)");
						output = stderr;
					}
				}

				const normalized = normalizeGooseOutput(output);
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

				// Validate output is not empty
				if (!output || output.trim().length === 0) {
					const stderrHint = stderr ? ` (stderr: ${stderr.slice(0, 500)})` : "";
					throw new Error(`Goose returned empty output - model may not have run${stderrHint}`);
				}

				// Validate output is not too short
				if (output.trim().length < MIN_OUTPUT_LENGTH) {
					throw new Error(
						`Goose output too short (${output.trim().length} chars) - may indicate failure`,
					);
				}

				return {
					output,
					durationMs,
					// Goose doesn't provide token counts
				};
			} catch (error) {
				const durationMs = Math.round(performance.now() - startTime);

				// Check if it's a timeout error
				if (
					error instanceof Error &&
					error.message.includes("timed out")
				) {
					throw new Error(
						`Goose timed out after ${Math.round(opts.timeoutMs / 1000)}s. Try increasing --timeout.`,
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
			}
		},
	};
}
