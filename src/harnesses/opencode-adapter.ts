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
import { logger } from "../lib/logger.js";
import {
	appendSignalAssessmentReasons,
	getTranscriptOrInputTaintReasons,
} from "../lib/signal-assessment.js";
import {
	appendRetryMarker,
	buildCodeOnlyPrompt,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "./code-output-policy.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
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
import { buildWorkspaceToolPrompt } from "./tool-prompt.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/** Interval for checking stale output (ms). */
const STALE_CHECK_INTERVAL_MS = 30_000;

/**
 * Detects permission-denied stderr emitted by OpenCode.
 *
 * @param stderr - Raw stderr text
 * @returns True when permission auto-rejection is present
 */
function hasPermissionDeniedStderr(stderr: string): boolean {
	return (
		/permission requested:/i.test(stderr) &&
		/(auto-rejecting|external_directory)/i.test(stderr)
	);
}

/** Creates an OpenCode harness adapter. */
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
			const isRetryAttempt = hasRetryMarker(prompt);
			const promptWithoutMarker = stripRetryMarker(prompt);
			const promptMode = opts.promptMode ?? "code-output";
			const hasExternalWorkingDirectory = opts.workingDirectory !== undefined;
			if (promptMode === "workspace" && !hasExternalWorkingDirectory) {
				throw new Error(
					"OpenCode workspace mode requires a caller-supplied workingDirectory",
				);
			}

			const runId = crypto.randomBytes(8).toString("hex");
			const toolOutputRoot = resolveOpenCodeToolOutputRoot();
			const workDir =
				opts.workingDirectory ??
				path.join(toolOutputRoot, `plebdev-bench-opencode-${runId}`);
			const solutionPath = path.join(workDir, SOLUTION_FILENAME);
			const configDir = path.join(
				toolOutputRoot,
				`plebdev-bench-opencode-config-${runId}`,
			);

			try {
				await fs.promises.mkdir(workDir, { recursive: true });
				await fs.promises.mkdir(configDir, { recursive: true });
			} catch (error) {
				throw new Error(
					`Failed to create OpenCode directories at "${workDir}": ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			if (!hasExternalWorkingDirectory) {
				try {
					await execa("git", ["init", "--quiet"], { cwd: workDir });
					await execa("git", ["config", "user.email", "bench@local"], {
						cwd: workDir,
					});
					await execa("git", ["config", "user.name", "Bench"], {
						cwd: workDir,
					});
				} catch (gitErr) {
					log.warn(
						{ error: gitErr },
						"Failed to initialize git repo in workDir",
					);
				}
			}

			const configPath = path.join(configDir, "opencode.json");

			const providerName = runtime.name;
			if (runtime.apiFormat === "openai-compat") {
				const apiKey = process.env.VLLM_API_KEY ?? process.env.OPENAI_API_KEY;
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

			const modelArg = `${providerName}/${model}`;

			const env = buildOpenCodeEnv({
				configPath,
				configJson: openCodeConfigJson,
				runtimeName: runtime.name,
			});

			const fullPrompt =
				promptMode === "workspace"
					? buildWorkspaceToolPrompt({
							toolNames: ["read", "edit", "write", "glob", "grep", "bash"],
							taskPrompt: promptWithoutMarker,
							workspaceRootPath: workDir,
							toolUsageHint:
								"Use read/glob/grep to inspect the workspace and bash for mkdir/delete/move operations when the task requires them.",
						})
					: buildCodeOnlyPrompt(promptWithoutMarker, isRetryAttempt);

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

			let codeFilePath: string | undefined;
			const controller = new AbortController();
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			let staleCheckId: ReturnType<typeof setInterval> | undefined;
			let lastOutputTime = Date.now();
			let timedOut = false;
			let staleKilled = false;
			let staleTimeoutMs = 0;
			let killAttempted = false;

			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];

			try {
				const proc = execa("opencode", args, {
					env,
					cwd: workDir,
					stdin: "ignore",
					stdout: "pipe",
					stderr: "pipe",
					cancelSignal: controller.signal,
					reject: false,
				});

				const pid = proc.pid;
				log.debug({ pid }, "OpenCode process started");

				proc.stdout?.on("data", (chunk: Buffer) => {
					lastOutputTime = Date.now();
					stdoutChunks.push(chunk.toString());
				});
				proc.stderr?.on("data", (chunk: Buffer) => {
					lastOutputTime = Date.now();
					stderrChunks.push(chunk.toString());
				});

				const timeoutPromise: Promise<never> = new Promise((_, reject) => {
					timeoutId = setTimeout(() => {
						if (killAttempted) return;
						killAttempted = true;
						timedOut = true;

						if (staleCheckId) {
							clearInterval(staleCheckId);
							staleCheckId = undefined;
						}

						log.warn({ timeoutMs, pid }, "OpenCode timed out, killing process");
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

							clearInterval(staleCheckId);
							staleCheckId = undefined;

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

				const result = await Promise.race([proc, timeoutPromise, stalePromise]);

				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);
				timeoutId = undefined;
				staleCheckId = undefined;

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

				const stdout = stdoutChunks.join("");
				const stderr = stderrChunks.join("");
				const boundaryReasons = Array.from(
					new Set([
						...(hasPermissionDeniedStderr(stderr)
							? (["tool_permission_denied"] as const)
							: []),
						...getTranscriptOrInputTaintReasons(stdout),
						...getTranscriptOrInputTaintReasons(stderr),
					]),
				);
				const signalAssessment =
					boundaryReasons.length > 0
						? appendSignalAssessmentReasons(undefined, boundaryReasons)
						: undefined;
				const durationMs = Math.round(performance.now() - startTime);

				if (result.exitCode !== 0 && result.exitCode !== null) {
					const stdoutPreview = stdout.trim().slice(0, 800);
					const stderrPreview = stderr.trim().slice(0, 800);
					throw Object.assign(
						new Error(
						`OpenCode exited with code ${result.exitCode}: ` +
							`${stderrPreview || "no stderr"}${stdoutPreview ? ` | stdout: ${stdoutPreview}` : ""}`,
						),
						{
							signalAssessment,
							durationMs,
							output: stdout.trim().length > 0 ? stdout : stderr,
						},
					);
				}

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

				let output = stdout;

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
				const normalizedReasons = Array.from(
					new Set([
						...getTranscriptOrInputTaintReasons(output),
					]),
				);
				const normalizedSignalAssessment =
					normalizedReasons.length > 0
						? appendSignalAssessmentReasons(signalAssessment, normalizedReasons)
						: signalAssessment;

				if (promptMode === "workspace") {
					return {
						output,
						durationMs,
						signalAssessment: normalizedSignalAssessment,
					};
				}

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

				if (!codeFilePath) {
					if (
						durationMs < 2000 &&
						(!output || output.trim().length < MIN_OUTPUT_LENGTH) &&
						normalizedReasons.length === 0
					) {
						throw new Error(
							`OpenCode returned empty output instantly (${durationMs}ms) - model "${model}" may not be recognized by OpenCode`,
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
						return {
							output,
							durationMs,
							codeFilePath,
							signalAssessment: appendSignalAssessmentReasons(
								normalizedSignalAssessment,
								[
									...decision.taintReasons,
									...(toolCallDetected
										? (["tool_call_not_executed"] as const)
										: []),
								],
							),
						};
					} else if (decision.shouldRetry) {
						const elapsedMs = Math.round(performance.now() - startTime);
						const remainingMs = timeoutMs - elapsedMs;
						if (!isRetryAttempt && remainingMs > 1000) {
							log.warn(
								{
									reason: decision.reason,
									remainingMs,
									outputPreview: output.slice(0, 200),
								},
								"OpenCode returned off-task/non-code output, retrying once",
							);
							const retryResult = await createOpenCodeAdapter().generate({
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
							"OpenCode finished with off-task/non-code output",
						);
					}
				}

				return {
					output,
					durationMs,
					codeFilePath,
					signalAssessment: normalizedSignalAssessment,
				};
			} catch (error) {
				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);

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

				if (error instanceof Error && error.message.includes("timed out")) {
					throw new Error(
						`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout.`,
					);
				}

				if (error && typeof error === "object" && "stderr" in error) {
					const execaError = error as { stderr: string; message: string };
					const errorReasons = [
						...(hasPermissionDeniedStderr(execaError.stderr)
							? (["tool_permission_denied"] as const)
							: []),
						...getTranscriptOrInputTaintReasons(execaError.stderr),
					];
					throw Object.assign(
						new Error(
							`OpenCode failed: ${execaError.stderr || execaError.message}`,
						),
						{
							signalAssessment:
								errorReasons.length > 0
									? appendSignalAssessmentReasons(undefined, errorReasons)
									: undefined,
						},
					);
				}

				throw error;
			} finally {
				if (timeoutId) clearTimeout(timeoutId);
				if (staleCheckId) clearInterval(staleCheckId);

				if (!hasExternalWorkingDirectory && !codeFilePath) {
					fs.promises
						.rm(workDir, { recursive: true, force: true })
						.catch(() => {});
				}
				fs.promises
					.rm(configDir, { recursive: true, force: true })
					.catch(() => {});
			}
		},
	};
}
