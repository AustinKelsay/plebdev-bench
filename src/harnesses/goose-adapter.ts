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

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { extractCode } from "../lib/code-extractor.js";
import { logger } from "../lib/logger.js";
import { normalizeOpenAiBasePath } from "./goose-openai.js";
import { normalizeGooseOutput } from "./goose-output.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/**
 * Creates a Goose harness adapter.
 *
 * @returns Harness instance for Goose
 * @throws {Error} If Goose execution fails, times out, or output directory setup fails
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

					const apiKey = process.env.VLLM_API_KEY ?? process.env.OPENAI_API_KEY;
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
				default: {
					const _exhaustive: never = runtime.apiFormat;
					log.warn(
						{ apiFormat: _exhaustive },
						"Unsupported runtime apiFormat for Goose",
					);
					throw new Error(
						`Unsupported runtime apiFormat for Goose: ${String(_exhaustive)}`,
					);
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
				"--max-turns",
				"1", // Keep Goose on a single completion turn
				"--provider",
				provider, // Override config - use determined provider
				"--model",
				model, // Override config - use our model
				"--output-format",
				"json", // Structured output for parsing
				"-i",
				"-", // Read prompt from stdin
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
						log.info(
							{ stderrUsed: true, length: stderr.length },
							"Using stderr output (stdout was empty)",
						);
						output = stderr;
					}
				}

				const normalized = normalizeGooseOutput(output);
				const toolCallDetected =
					normalized.method === "tool_call" ||
					normalized.method === "file_text";
				if (normalized.method !== "raw") {
					log.debug(
						{
							method: normalized.method,
							originalLength: output.length,
							normalizedLength: normalized.output.length,
						},
						"Normalized Goose output",
					);
					output = normalized.output;
				}

				log.debug(
					{
						durationMs,
						outputLength: output.length,
						exitCode: result.exitCode,
					},
					"Goose completed",
				);

				// Check if solution file was created by tool
				let codeFilePath: string | undefined;
				if (fs.existsSync(solutionPath)) {
					const code = await fs.promises.readFile(solutionPath, "utf-8");
					if (code.trim().length >= MIN_OUTPUT_LENGTH) {
						codeFilePath = solutionPath;
						log.info(
							{ codeFilePath, codeLength: code.length },
							"Code written via developer tool",
						);
					} else {
						log.warn(
							{ codeLength: code.trim().length },
							"solution.ts exists but is too short",
						);
					}
				}

				// Fast empty responses often indicate server-side errors (e.g., model mismatch).
				if (!codeFilePath) {
					if (
						durationMs < 2000 &&
						(!output || output.trim().length < MIN_OUTPUT_LENGTH)
					) {
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
							{
								toolCallDetected,
								outputLength: output.length,
								extractionMethod: extracted.method,
							},
							"Goose finished without usable code output",
						);

						if (output.trim().length < MIN_OUTPUT_LENGTH) {
							const error = new Error(
								"Goose returned no usable output and did not produce code",
							);
							(error as { output?: string; durationMs?: number }).output =
								output;
							(error as { output?: string; durationMs?: number }).durationMs =
								durationMs;
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
				if (error instanceof Error && error.message.includes("timed out")) {
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
