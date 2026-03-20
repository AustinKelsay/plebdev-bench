/**
 * Purpose: Goose CLI adapter implementing the Harness interface.
 * Exports: createGooseAdapter, GooseAdapterOptions
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
import { z } from "zod";
import { logger } from "../lib/logger.js";
import {
	appendRetryMarker,
	buildCodeOnlyPrompt,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "./code-output-policy.js";
import { normalizeOpenAiBasePath } from "./goose-openai.js";
import { normalizeGooseOutput } from "./goose-output.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
import { buildWorkspaceToolPrompt } from "./tool-prompt.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/** Default Goose turn limit for first attempt. */
const DEFAULT_GOOSE_MAX_TURNS = 1;

/** Default Goose turn limit for retry attempt. */
const DEFAULT_GOOSE_RETRY_MAX_TURNS = 3;

/** Configuration for Goose turn limits across attempts. */
export interface GooseAdapterOptions {
	/** Maximum Goose turns for the first attempt. */
	maxTurns?: number;
	/** Maximum Goose turns for the retry attempt. */
	retryMaxTurns?: number;
}

/** Runtime-validated Goose adapter options. */
const GooseAdapterOptionsSchema = z
	.object({
		maxTurns: z.number().optional(),
		retryMaxTurns: z.number().optional(),
	})
	.strict();

/**
 * Normalizes turn limits to safe positive integers.
 *
 * @param paramName - Option name for error context
 * @param value - User-supplied turn limit
 * @param fallback - Fallback turn limit when input is undefined
 * @returns Positive integer turn limit
 * @throws {TypeError} If value is provided but is not a positive integer
 */
function normalizeTurnLimit(
	paramName: string,
	value: number | undefined,
	fallback: number,
): number {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new TypeError(
			`${paramName} must be a positive integer, received ${String(value)}`,
		);
	}
	return value;
}

/**
 * Produces a redaction-safe fingerprint for logs.
 *
 * @param text - Arbitrary text payload
 * @returns Short SHA-256 fingerprint prefix
 */
function fingerprintText(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * Sanitizes runtime base URL for logs by retaining origin only.
 *
 * @param baseUrl - Runtime base URL
 * @returns Safe origin string or redacted fallback
 */
function sanitizeRuntimeBaseUrl(baseUrl: string): string {
	try {
		return new URL(baseUrl).origin;
	} catch {
		return "REDACTED";
	}
}

/**
 * Creates a Goose harness adapter.
 *
 * @param options - Optional Goose adapter settings
 * @returns Harness instance for Goose
 * @throws {TypeError} If options parsing/normalization fails due to invalid Goose config values
 * @throws {Error} If Goose execution fails, times out, or output directory setup fails
 */
export function createGooseAdapter(options?: GooseAdapterOptions): Harness {
	const parsedOptions = GooseAdapterOptionsSchema.parse(
		options === undefined ? {} : options,
	);
	const maxTurns = normalizeTurnLimit(
		"goose.maxTurns",
		parsedOptions.maxTurns,
		DEFAULT_GOOSE_MAX_TURNS,
	);
	const requestedRetryMaxTurns = normalizeTurnLimit(
		"goose.retryMaxTurns",
		parsedOptions.retryMaxTurns,
		DEFAULT_GOOSE_RETRY_MAX_TURNS,
	);
	if (requestedRetryMaxTurns < maxTurns) {
		throw new TypeError(
			`goose.retryMaxTurns must be greater than or equal to goose.maxTurns (maxTurns=${maxTurns}, requestedRetryMaxTurns=${requestedRetryMaxTurns})`,
		);
	}
	const retryMaxTurns = requestedRetryMaxTurns;

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
			const isRetryAttempt = hasRetryMarker(prompt);
			const promptWithoutMarker = stripRetryMarker(prompt);
			const maxTurnsForAttempt = isRetryAttempt ? retryMaxTurns : maxTurns;
			const promptMode = opts.promptMode ?? "code-output";
			if (promptMode === "workspace" && opts.workingDirectory === undefined) {
				throw new Error(
					"Goose workspace mode requires a caller-supplied workingDirectory",
				);
			}

			// Create unique temp directory for this generation
			const runId = crypto.randomBytes(8).toString("hex");
			const workDir =
				opts.workingDirectory ??
				path.join(os.tmpdir(), `plebdev-bench-goose-${runId}`);
			const solutionPath = path.join(workDir, SOLUTION_FILENAME);
			const executionCwd = workDir;

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

			const fullPrompt =
				promptMode === "workspace"
					? buildWorkspaceToolPrompt({
							toolNames: ["text_editor"],
							taskPrompt: promptWithoutMarker,
						})
					: buildCodeOnlyPrompt(promptWithoutMarker, isRetryAttempt);

			// CRITICAL: Use --provider and --model flags to override Goose's config file
			const args = [
				"run",
				"--no-session",
				"--max-turns",
				String(maxTurnsForAttempt),
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
				{
					cmd: "goose",
					model,
					executionCwd,
					runtimeBaseUrl: sanitizeRuntimeBaseUrl(runtime.baseUrl),
					maxTurnsForAttempt,
				},
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

				if (promptMode === "workspace") {
					return {
						output,
						durationMs,
					};
				}

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

					const decision = evaluateCodeOnlyOutput(output, MIN_OUTPUT_LENGTH);
					if (
						decision.method !== "raw" &&
						decision.code.length >= MIN_OUTPUT_LENGTH
					) {
						await fs.promises.writeFile(solutionPath, decision.code, "utf-8");
						codeFilePath = solutionPath;
						log.info(
							{
								codeFilePath,
								extractionMethod: decision.method,
								codeLength: decision.code.length,
								toolCallDetected,
							},
							"Persisted extracted code to solution.ts (tool output absent)",
						);
					} else if (decision.shouldRetry) {
						const elapsedMs = Math.round(performance.now() - startTime);
						const remainingMs = timeoutMs - elapsedMs;
						if (!isRetryAttempt && remainingMs > 1000) {
							const retryContext = {
								reason: decision.reason,
								remainingMs,
								outputLength: output.length,
								outputFingerprint: fingerprintText(output),
								retryMaxTurns,
							};
							if (decision.reason === "turn_limit") {
								log.warn(
									retryContext,
									"Goose hit turn/input limit, retrying once with higher max turns",
								);
							} else {
								log.warn(
									retryContext,
									"Goose returned off-task/non-code output, retrying once",
								);
							}
							const retryResult = await createGooseAdapter({
								maxTurns,
								retryMaxTurns,
							}).generate({
								...opts,
								prompt: appendRetryMarker(promptWithoutMarker),
								timeoutMs: remainingMs,
							});
							return {
								...retryResult,
								durationMs: Math.round(performance.now() - startTime),
							};
						}

						log.warn(
							{
								toolCallDetected,
								outputLength: output.length,
								extractionMethod: decision.method,
								reason: decision.reason,
							},
							"Goose finished with off-task/non-code output",
						);
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
