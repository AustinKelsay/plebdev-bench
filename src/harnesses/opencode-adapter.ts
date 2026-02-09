/**
 * Purpose: OpenCode CLI adapter implementing the Harness interface.
 * Exports: createOpenCodeAdapter
 *
 * Runs OpenCode via CLI (execa): `opencode run "<prompt>" --model <provider>/<model> --format json`
 *
 * Invariants:
 * - Uses runtime.baseUrl for provider baseURL
 * - Best-effort tool output capture; plain output is still scored
 * - Enforces timeout + stale-output kill for cleanup
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execa } from "execa";
import { extractCode } from "../lib/code-extractor.js";
import { logger } from "../lib/logger.js";
import {
	buildOpenCodeConfig,
	buildOpenCodeEnv,
	resolveOpenCodeToolOutputRoot,
} from "./opencode-config.js";
import { normalizeOpenCodeOutput } from "./opencode-output.js";
import {
	computeStaleOutputTimeoutMs,
	forceKillProcess,
} from "./opencode-process.js";
import type {
	GenerateOpts,
	GenerateResult,
	Harness,
} from "./harness.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/** Interval for checking stale output (ms). */
const STALE_CHECK_INTERVAL_MS = 30_000;

/**
 * Creates an OpenCode harness adapter.
 *
 * @returns Harness instance for OpenCode
 */
export function createOpenCodeAdapter(): Harness {
	return {
		name: "opencode" as const,

		async ping(): Promise<boolean> {
			const log = logger.child({ harness: "opencode" });
			try {
				const versionResult = await execa("opencode", ["--version"], {
					timeout: 5000,
				});
				const version = versionResult.stdout.trim();

				const versionMatch = version.match(/(\d+)\.(\d+)/);
				if (versionMatch) {
					const major = Number.parseInt(versionMatch[1], 10);
					const minor = Number.parseInt(versionMatch[2], 10);
					if (major < 1 || (major === 1 && minor < 1)) {
						log.warn(
							{ version },
							"OpenCode version too old, requires >= 1.1.0",
						);
						return false;
					}
				}

				return true;
			} catch {
				return false;
			}
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const { runtime, model, prompt, timeoutMs } = opts;
			const log = logger.child({ harness: "opencode", model });
			const startTime = performance.now();

			// Unique directory in tool-output root avoids interactive permission prompts.
			const runId = crypto.randomBytes(8).toString("hex");
			const toolOutputRoot = resolveOpenCodeToolOutputRoot();
			const workDir = path.join(
				toolOutputRoot,
				`plebdev-bench-opencode-${runId}`,
			);
			const solutionPath = path.join(workDir, SOLUTION_FILENAME);

			try {
				await fs.promises.mkdir(workDir, { recursive: true });
			} catch (error) {
				throw new Error(
					`Failed to create OpenCode workDir at "${workDir}": ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// OpenCode checks git context; initializing avoids "not a git repo" confusion.
			try {
				await execa("git", ["init", "--quiet"], { cwd: workDir });
				await execa("git", ["config", "user.email", "bench@local"], {
					cwd: workDir,
				});
				await execa("git", ["config", "user.name", "Bench"], { cwd: workDir });
			} catch (gitErr) {
				log.warn({ error: gitErr }, "Failed to initialize git repo in workDir");
			}

			const configPath = path.join(workDir, "opencode.json");

			const providerName = runtime.name; // "ollama" or "vllm"
			if (runtime.apiFormat === "openai-compat") {
				const apiKey =
					process.env.VLLM_API_KEY ?? process.env.OPENAI_API_KEY;
				if (!apiKey) {
					log.warn(
						"No VLLM_API_KEY or OPENAI_API_KEY set; using dummy key for OpenAI-compatible provider",
					);
				}
			}

			const { config: openCodeConfig, configJson: openCodeConfigJson } =
				buildOpenCodeConfig({
					runtimeName: providerName,
					runtimeApiFormat: runtime.apiFormat,
					runtimeBaseUrl: runtime.baseUrl,
					model,
				});
			try {
				await fs.promises.writeFile(
					configPath,
					JSON.stringify(openCodeConfig, null, 2),
				);
			} catch (configErr) {
				log.warn({ error: configErr }, "Failed to write opencode.json config");
			}

			log.debug(
				{ workDir, toolOutputRoot, runtimeBaseUrl: runtime.baseUrl },
				"Created OpenCode work directory",
			);

			// Use runtime model identifier verbatim so provider receives the exact model ID.
			const modelArg = `${providerName}/${model}`;

			const env = buildOpenCodeEnv({
				configPath,
				configJson: openCodeConfigJson,
				runtimeName: runtime.name,
			});

			const fullPrompt = `${prompt.trim()}\n\nReturn the final TypeScript code in your response. Do not return status-only messages.`;

			const args = [
				"run",
				fullPrompt,
				"--model",
				modelArg,
				"--format",
				"json",
				"--log-level",
				"ERROR",
			];
			log.debug(
				{ cmd: "opencode", model, workDir },
				"Executing OpenCode command directly in workDir",
			);

			// Track codeFilePath outside try block for cleanup logic
			let codeFilePath: string | undefined;

			// AbortController for timeout management
			const controller = new AbortController();
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			let staleCheckId: ReturnType<typeof setInterval> | undefined;
			let lastOutputTime = Date.now();
			let timedOut = false;
			let staleKilled = false;
			let staleTimeoutMs = 0;
			let killAttempted = false;

			// Track stdout/stderr for output collection
			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];

			try {
				// Start the process with piped output for stale detection
				const proc = execa("opencode", args, {
					env,
					cwd: workDir,
					stdin: "ignore",
					stdout: "pipe",
					stderr: "pipe",
					// Use cancelSignal for abort control (execa v9+)
					cancelSignal: controller.signal,
					// Don't reject on non-zero exit - we handle errors ourselves
					reject: false,
				});

				const pid = proc.pid;
				log.debug({ pid }, "OpenCode process started");

				// Set up output listeners to track activity and collect output
				proc.stdout?.on("data", (chunk: Buffer) => {
					lastOutputTime = Date.now();
					stdoutChunks.push(chunk.toString());
				});
				proc.stderr?.on("data", (chunk: Buffer) => {
					lastOutputTime = Date.now();
					stderrChunks.push(chunk.toString());
				});

				// Set up main timeout
				const timeoutPromise: Promise<never> = new Promise((_, reject) => {
					timeoutId = setTimeout(() => {
					if (killAttempted) return;
					killAttempted = true;
					timedOut = true;

					// Clear intervals IMMEDIATELY to prevent repeated kill attempts
					if (staleCheckId) {
						clearInterval(staleCheckId);
						staleCheckId = undefined;
					}

					log.warn(
						{ timeoutMs, pid },
						"OpenCode timed out, killing process",
					);
					void forceKillProcess(
						proc,
						pid,
						log,
						`timeout after ${timeoutMs}ms`,
					);
					controller.abort();
					reject(
						new Error(
							`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
						),
					);
					}, timeoutMs);
				});

				// Set up stale output detection
				const staleOutputTimeoutMs = computeStaleOutputTimeoutMs(timeoutMs);
				staleTimeoutMs = staleOutputTimeoutMs;
				const stalePromise: Promise<never> = new Promise((_, reject) => {
					staleCheckId = setInterval(() => {
						if (killAttempted) return;

						const staleDuration = Date.now() - lastOutputTime;
						const threshold = staleOutputTimeoutMs;

						if (staleDuration > threshold) {
							killAttempted = true;
							staleKilled = true;
							staleTimeoutMs = threshold;

							// Clear interval IMMEDIATELY to prevent repeated kill attempts
							clearInterval(staleCheckId);
							staleCheckId = undefined;

							// Also clear the main timeout since we're killing now
							if (timeoutId) {
								clearTimeout(timeoutId);
								timeoutId = undefined;
							}

							log.warn(
								{ staleDurationMs: staleDuration, pid, thresholdMs: threshold },
								"OpenCode appears hung (no output), killing process",
							);
							void forceKillProcess(
								proc,
								pid,
								log,
								`no output for ${staleDuration}ms`,
							);
							controller.abort();
							reject(
								new Error(
									`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
								),
							);
						}
					}, STALE_CHECK_INTERVAL_MS);
				});

				// Wait for process completion, timeout, or stale-output detection.
				// Promise.race prevents hanging forever if process termination is delayed.
				const result = await Promise.race([proc, timeoutPromise, stalePromise]);

				// Clear timers immediately after completion
				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);
				timeoutId = undefined;
				staleCheckId = undefined;

				// Check for abort/timeout errors
				if (timedOut) {
					throw new Error(
						`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
					);
				}
				if (staleKilled) {
					throw new Error(
						`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
					);
				}

				// Collect output from chunks
				const stdout = stdoutChunks.join("");
				const stderr = stderrChunks.join("");

				// Check for non-zero exit code
				if (result.exitCode !== 0 && result.exitCode !== null) {
					const stdoutPreview = stdout.trim().slice(0, 800);
					const stderrPreview = stderr.trim().slice(0, 800);
					throw new Error(
						`OpenCode exited with code ${result.exitCode}: ` +
							`${stderrPreview || "no stderr"}${stdoutPreview ? ` | stdout: ${stdoutPreview}` : ""}`,
					);
				}

				const durationMs = Math.round(performance.now() - startTime);

				// Log stderr if present (may contain warnings)
				if (stderr?.trim()) {
					log.warn(
						{ stderr: stderr.slice(0, 500) },
						"OpenCode produced stderr",
					);
				}

				log.debug(
					{
						durationMs,
						outputLength: stdout.length,
						exitCode: result.exitCode,
					},
					"OpenCode completed",
				);

				// Use raw stdout directly (simpler and more reliable)
				let output = stdout;

				// Fallback to stderr if stdout empty (OpenCode sometimes writes there)
				if (!output || output.trim().length === 0) {
					const stderrContent = stderr.trim();
					if (stderrContent.length >= MIN_OUTPUT_LENGTH) {
						log.info(
							{ stderrUsed: true, length: stderrContent.length },
							"Using stderr output (stdout was empty)",
						);
						output = stderrContent;
					}
				}

				const normalized = normalizeOpenCodeOutput(output);
				const toolCallDetected = normalized.method === "tool_call";
				if (normalized.method !== "raw") {
					log.debug(
						{
							method: normalized.method,
							originalLength: output.length,
							normalizedLength: normalized.output.length,
						},
						"Normalized OpenCode output",
					);
					output = normalized.output;
				}

				// Check if solution file was created by tool
				if (fs.existsSync(solutionPath)) {
					const code = await fs.promises.readFile(solutionPath, "utf-8");
					if (code.trim().length >= MIN_OUTPUT_LENGTH) {
						codeFilePath = solutionPath;
						log.info(
							{ codeFilePath, codeLength: code.length },
							"Code written via edit tool",
						);
					} else {
						log.warn(
							{ codeLength: code.trim().length },
							"solution.ts exists but is too short",
						);
					}
				}

				// Fast empty responses often indicate server-side errors (e.g., model not found).
				if (!codeFilePath) {
					if (durationMs < 2000 && (!output || output.trim().length < MIN_OUTPUT_LENGTH)) {
						throw new Error(
							`OpenCode returned empty output instantly (${durationMs}ms) - model "${model}" may not be recognized by OpenCode`,
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
							"OpenCode finished without usable code output",
						);
					}
				}

				return {
					output,
					durationMs,
					codeFilePath,
					// OpenCode doesn't provide token counts
				};
			} catch (error) {
				// Clean up timers on error
				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);

				// Check for abort errors (from our timeout/stale handling)
				if (error instanceof Error && error.name === "AbortError") {
					if (timedOut) {
						throw new Error(
							`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
						);
					}
					if (staleKilled) {
						throw new Error(
							`OpenCode hung (no output for ${Math.round(staleTimeoutMs / 1000)}s). Process may be stuck on backend.`,
						);
					}
					throw new Error("OpenCode was aborted");
				}

				// Check if it's a timeout error (from execa's built-in timeout)
				if (error instanceof Error && error.message.includes("timed out")) {
					throw new Error(
						`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
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
			} finally {
				// Always clean up timers
				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);

				// Clean up temp directory if no codeFilePath was set.
				// If codeFilePath IS set, preserve it for scoring (scorer reads the file).
				// Preserve directory only when tool output exists (scorer reads the file).
				if (!codeFilePath) {
					fs.promises
						.rm(workDir, { recursive: true, force: true })
						.catch(() => {
							// Best-effort cleanup, ignore errors
						});
				}
				// Note: When codeFilePath is set, cleanup is deferred to OS temp cleanup
				// since scoring happens after generate() returns.
			}
		},
	};
}
