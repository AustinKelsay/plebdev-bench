/**
 * Purpose: Goose CLI adapter implementing the Harness interface.
 * Exports: createGooseAdapter
 *
 * This adapter runs Goose via CLI using execa.
 * Command: goose run --no-session --max-turns 5 -q -t "<prompt>"
 *
 * Optimizations:
 * - Runs in temp directory to avoid codebase scanning
 * - Uses --max-turns 5 to limit agentic loops
 * - Uses -q (quiet) mode to reduce output overhead
 * - Uses stdin: "ignore" to prevent hanging
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
			const env = {
				...process.env,
				GOOSE_MODE: "auto",
				GOOSE_CONTEXT_STRATEGY: "summarize",
				GOOSE_MAX_TURNS: "5", // Reduced from 50 - simple prompts don't need many turns
				GOOSE_PROVIDER: "ollama",
				GOOSE_MODEL: opts.model,
				GOOSE_CLI_MIN_PRIORITY: "0.2",
			};

			// Optimized args: limit turns and use quiet mode
			// CRITICAL: Use --provider and --model flags to override Goose's config file
			const args = [
				"run",
				"--no-session",
				"--provider", "ollama",       // Override config - force Ollama
				"--model", opts.model,        // Override config - use our model
				"--max-turns", "5",           // Limit agentic loops
				"-q",                         // Quiet mode - faster output
				"-t", opts.prompt,
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
					stdin: "ignore", // Prevent stdin hanging
				});

				const durationMs = Math.round(performance.now() - startTime);
				const output = result.stdout;

				// Log stderr if present (may contain warnings)
				if (result.stderr && result.stderr.trim()) {
					log.warn({ stderr: result.stderr.slice(0, 500) }, "Goose produced stderr");
				}

				log.debug(
					{ durationMs, outputLength: output.length, exitCode: result.exitCode },
					"Goose completed",
				);

				// Validate output is not empty
				if (!output || output.trim().length === 0) {
					throw new Error("Goose returned empty output - model may not have run");
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
