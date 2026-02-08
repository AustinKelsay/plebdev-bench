/**
 * Purpose: OpenCode CLI adapter implementing the Harness interface.
 * Exports: createOpenCodeAdapter
 *
 * This adapter runs OpenCode via CLI using execa directly in the working directory.
 * Command: opencode run "<prompt>" --model <provider>/<model> --format json
 *
 * Invariants:
 * - Uses runtime.baseUrl for runtime-specific OpenAI-compatible provider config
 * - Runs directly in workDir (no server mode) for reliable tool execution
 * - Timeout handled via AbortController + process group kill for reliable cleanup
 * - Stale output detection kills hung processes (no output for 2 min)
 * - Tool output is optional; plain assistant output is still scored
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ResultPromise, execa } from "execa";
import type pino from "pino";
import { extractCode } from "../lib/code-extractor.js";
import { logger } from "../lib/logger.js";
import {
	toOpenAiCompatBaseUrl,
	toOpenCodeModelKey,
} from "./opencode-model.js";
import type {
	GenerateOpts,
	GenerateResult,
	Harness,
} from "./harness.js";

/** Minimum output length to consider a response valid. */
const MIN_OUTPUT_LENGTH = 10;

/** Output filename for tool-calling mode. */
const SOLUTION_FILENAME = "solution.ts";

/**
 * Minimum time without output before considering process hung (ms).
 */
const STALE_OUTPUT_TIMEOUT_MS = 120_000;

/**
 * Maximum time without output before considering process hung (ms).
 */
const MAX_STALE_OUTPUT_TIMEOUT_MS = 300_000;

/** Interval for checking stale output (ms). */
const STALE_CHECK_INTERVAL_MS = 30_000;

/** Delay after SIGTERM before sending SIGKILL (ms). */
const FORCE_KILL_DELAY_MS = 2_000;

/** OpenCode tool-output root subpath within XDG data home. */
const OPENCODE_TOOL_OUTPUT_SUBPATH = path.join("opencode", "tool-output");

/**
 * Resolve OpenCode's tool-output root directory.
 *
 * OpenCode allows external directory access for its tool-output path by default.
 * Using this location avoids interactive permission prompts in headless runs.
 *
 * @returns Absolute path to tool-output root directory
 */
function resolveOpenCodeToolOutputRoot(): string {
	const xdgDataHome =
		typeof process.env.XDG_DATA_HOME === "string" &&
		process.env.XDG_DATA_HOME.trim().length > 0
			? process.env.XDG_DATA_HOME.trim()
			: path.join(os.homedir(), ".local", "share");

	return path.join(xdgDataHome, OPENCODE_TOOL_OUTPUT_SUBPATH);
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
	const match = trimmed.match(
		/^```(?:json|typescript|ts|javascript|js)?\n([\s\S]*?)\n?```$/,
	);
	if (match) {
		return match[1].trim();
	}
	return trimmed;
}

/**
 * Tool name variants that indicate file writing operations.
 * Models use different naming conventions.
 */
const WRITE_TOOL_NAMES = new Set([
	"edit",
	"write",
	"writefile",
	"write_file",
	"create_file",
	"createfile",
	"text_editor",
	"developer__text_editor",
	// Case-insensitive variants are handled below
]);

/**
 * Extracts code content from tool arguments.
 *
 * @param args - Tool arguments object
 * @returns Extracted code or null
 */
function extractContentFromArgs(args: Record<string, unknown>): string | null {
	const content =
		args.content ??
		args.contents ??
		args.text ??
		args.code ??
		args.file_text ??
		args.fileText ??
		args.file;

	if (typeof content === "string" && content.trim().length > 0) {
		return content;
	}

	return null;
}

/**
 * Extracts code from a tool call object.
 *
 * @param obj - Tool call object
 * @returns Extracted code or null
 */
function extractFromToolCallObject(obj: unknown): string | null {
	const MAX_DEPTH = 4;

	const visit = (value: unknown, depth: number): string | null => {
		if (depth > MAX_DEPTH || !value) return null;

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = visit(item, depth + 1);
				if (found) return found;
			}
			return null;
		}

		if (typeof value !== "object") return null;

		const record = value as Record<string, unknown>;

		// Direct tool call: { name, arguments }
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
						const parsedArgs = JSON.parse(argsValue) as unknown;
						if (typeof parsedArgs === "object" && parsedArgs !== null) {
							argsObj = parsedArgs as Record<string, unknown>;
						}
					} catch {
						// ignore
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

		// Common nesting keys for tool calls/events
		const nestedKeys = [
			"tool",
			"toolCall",
			"tool_call",
			"toolCalls",
			"tool_calls",
			"call",
			"data",
			"part",
			"delta",
		];

		for (const key of nestedKeys) {
			if (key in record) {
				const found = visit(record[key], depth + 1);
				if (found) return found;
			}
		}

		return null;
	};

	return visit(obj, 0);
}

/**
 * Extracts code from an OpenCode edit tool call JSON object.
 * Handles cases where model outputs tool call directly instead of OpenCode executing it.
 *
 * @param text - Text that might be JSON tool call (possibly wrapped in markdown)
 * @returns Extracted code or null
 */
function extractFromToolCall(text: string): string | null {
	// Strip markdown code blocks if present
	const jsonText = stripMarkdownCodeBlock(text);

	// First try standard JSON parsing
	try {
		const parsed = JSON.parse(jsonText) as unknown;
		const extracted = extractFromToolCallObject(parsed);
		if (extracted) return extracted;
	} catch {
		// Try to extract content using regex for malformed JSON (e.g., backtick strings)
		// Match: "content": `...` or "content": "..."
		const contentMatch = jsonText.match(
			/"(?:content|contents|text|code)":\s*[`"]([\s\S]*?)[`"]\s*[,}]/,
		);
		if (contentMatch?.[1]) {
			const content = contentMatch[1]
				.replace(/\\n/g, "\n")
				.replace(/\\t/g, "\t")
				.replace(/\\"/g, '"');
			if (content.trim().length > 0) {
				return content;
			}
		}
		return null;
	}

	return null;
}

/**
 * Normalize OpenCode JSON/JSONL output into plain assistant text or extracted code.
 *
 * OpenCode's --format json outputs JSONL (one JSON object per line) with streaming events.
 * Text content is in the "text" type events under part.text.
 *
 * @param raw - Raw stdout/stderr from OpenCode
 * @returns Normalized output and method indicator
 */
function normalizeOpenCodeOutput(raw: string): {
	output: string;
	method: "raw" | "json" | "tool_call";
} {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { output: raw, method: "raw" };
	}

	// Parse JSONL format - extract text from streaming events
	const textParts: string[] = [];
	let parsedLines = 0;

	const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
	let toolCallOutput: string | null = null;
	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as {
				type?: string;
				text?: string;
				part?: { type?: string; text?: string; delta?: { text?: string } };
			};

			parsedLines += 1;

			if (!toolCallOutput) {
				const toolCallCode = extractFromToolCallObject(obj);
				if (toolCallCode) {
					toolCallOutput = toolCallCode;
				}
			}

			// Extract text from various possible locations in the event
			const text =
				typeof obj.part?.text === "string"
					? obj.part.text
					: typeof obj.part?.delta?.text === "string"
						? obj.part.delta.text
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

	if (toolCallOutput) {
		return { output: toolCallOutput, method: "tool_call" };
	}

	// If we parsed JSONL successfully, try to extract tool call from the combined text
	if (parsedLines > 0 && textParts.length > 0) {
		const combined = textParts.join("");
		// Try to extract tool call from combined text (model might output JSON tool call as text)
		const toolCallCode = extractFromToolCall(combined);
		if (toolCallCode) {
			return { output: toolCallCode, method: "tool_call" };
		}
		return { output: combined, method: "json" };
	}

	// Fallback: try parsing as a single JSON object
	try {
		const obj = JSON.parse(trimmed) as {
			text?: string;
			part?: { text?: string; delta?: { text?: string } };
		};
		const toolCallCode = extractFromToolCallObject(obj);
		if (toolCallCode) {
			return { output: toolCallCode, method: "tool_call" };
		}
		const text =
			typeof obj.part?.text === "string"
				? obj.part.text
				: typeof obj.part?.delta?.text === "string"
					? obj.part.delta.text
					: typeof obj.text === "string"
						? obj.text
						: undefined;
		if (typeof text === "string" && text.length > 0) {
			// Try to extract tool call from text
			const toolCallCode = extractFromToolCall(text);
			if (toolCallCode) {
				return { output: toolCallCode, method: "tool_call" };
			}
			return { output: text, method: "json" };
		}
	} catch {
		// Ignore parse failures
	}

	// Last resort: try direct tool call extraction on raw input
	// This handles cases where output is a single raw JSON tool call (not JSONL)
	const directToolCallCode = extractFromToolCall(raw);
	if (directToolCallCode) {
		return { output: directToolCallCode, method: "tool_call" };
	}

	return { output: raw, method: "raw" };
}

/**
 * Forcefully kills a process and its entire process tree.
 * Attempts SIGTERM first, then uses shell commands to kill the process tree.
 *
 * Node's process.kill() cannot kill child processes. OpenCode spawns child
 * processes for Ollama communication, so we must use shell commands (pkill, kill)
 * to reliably terminate the entire process tree.
 *
 * @param proc - The execa process to kill
 * @param pid - Process ID (for logging)
 * @param log - Logger instance
 * @param reason - Reason for killing (for logging)
 */
async function forceKillProcess(
	proc: ResultPromise,
	pid: number | undefined,
	log: pino.Logger,
	reason: string,
): Promise<void> {
	log.warn({ pid, reason }, "Force killing OpenCode process");

	// First try graceful kill via execa
	proc.kill("SIGTERM");

	// Wait a bit for graceful shutdown
	await new Promise((resolve) => setTimeout(resolve, FORCE_KILL_DELAY_MS));

	if (pid) {
		try {
			// Check if process still exists (throws if dead)
			process.kill(pid, 0);

			log.warn({ pid }, "Process still alive after SIGTERM, killing process tree");

			// Use pkill to kill all child processes of the given PID
			// -9 sends SIGKILL, -P targets children of the PID
			try {
				await execa("pkill", ["-9", "-P", String(pid)], { reject: false });
			} catch {
				// pkill may fail if no children, that's ok
			}

			// Then kill the main process with shell command
			try {
				await execa("kill", ["-9", String(pid)], { reject: false });
			} catch {
				// kill may fail if process already dead, that's ok
			}

			// Also try process.kill as fallback
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// May fail if already dead
			}
		} catch {
			// Process already dead, good
		}
	}
}

/**
 * Computes a dynamic stale-output timeout based on the overall request timeout.
 *
 * @param timeoutMs - Overall generation timeout
 * @returns Timeout in milliseconds for stale-output detection
 */
function computeStaleOutputTimeoutMs(timeoutMs: number): number {
	const halfTimeout = Math.floor(timeoutMs * 0.5);
	return Math.min(
		MAX_STALE_OUTPUT_TIMEOUT_MS,
		Math.max(STALE_OUTPUT_TIMEOUT_MS, halfTimeout),
	);
}

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
				// Check if opencode CLI is available and get version
				const versionResult = await execa("opencode", ["--version"], {
					timeout: 5000,
				});
				const version = versionResult.stdout.trim();

				// Require minimum version 1.1.0 for stable tool support
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

			// Create unique work directory for this generation in OpenCode tool-output root
			// to avoid interactive external-directory permission prompts.
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

			// Initialize as git repo to avoid "not a git repo" confusion
			// OpenCode checks for git context and gets confused when the directory isn't a repo
			try {
				await execa("git", ["init", "--quiet"], { cwd: workDir });
				await execa("git", ["config", "user.email", "bench@local"], {
					cwd: workDir,
				});
				await execa("git", ["config", "user.name", "Bench"], { cwd: workDir });
			} catch (gitErr) {
				log.warn({ error: gitErr }, "Failed to initialize git repo in workDir");
			}

			// Create opencode.json config file to explicitly enable edit/write tools
			// and disable distracting tools that confuse smaller models
			const configPath = path.join(workDir, "opencode.json");

			// Determine provider config based on runtime API format
			const providerName = runtime.name; // "ollama" or "vllm"
			const baseURL = toOpenAiCompatBaseUrl(runtime.baseUrl);

			// Build provider options with optional API key for vLLM
			const providerOptions: Record<string, string> = { baseURL };
			if (runtime.apiFormat === "openai-compat") {
				const apiKey =
					process.env.VLLM_API_KEY ?? process.env.OPENAI_API_KEY;
				if (!apiKey) {
					log.warn(
						"No VLLM_API_KEY or OPENAI_API_KEY set; using dummy key for OpenAI-compatible provider",
					);
				}
				providerOptions.apiKey = apiKey ?? "dummy";
			}

			const modelKey = toOpenCodeModelKey(model);
			const openCodeConfig = {
				$schema: "https://opencode.ai/config.json",
				provider: {
					[providerName]: {
						npm: "@ai-sdk/openai-compatible",
						name: providerName === "ollama" ? "Ollama (local)" : "vLLM",
						options: providerOptions,
						models: {
							[model]: { name: model, tools: true },
							// Include a safe, slash-free alias in case the CLI normalizes model IDs.
							...(modelKey !== model
								? { [modelKey]: { name: model, tools: true } }
								: {}),
						},
					},
				},
				permission: {
					edit: "allow",
					write: "allow",
					read: "allow",
					bash: "deny",
					question: "deny",
					websearch: "deny",
					webfetch: "deny",
				},
				tools: {
					edit: true,
					write: true,
					read: false,
					bash: false,
					question: false,
					websearch: false,
					webfetch: false,
					glob: false,
					grep: false,
					task: false,
				},
			};
			const openCodeConfigJson = JSON.stringify(openCodeConfig);
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

			// Environment optimized for headless/benchmark mode
			// Disable features that might confuse the model or cause side effects
			// vLLM tool-calling requests can exceed context length if max_tokens is too high.
			// Cap output tokens to keep requests within the model context window.
			const env = {
				...process.env,
				OPENCODE_CONFIG: configPath,
				OPENCODE_CONFIG_CONTENT: openCodeConfigJson,
				OPENCODE_DISABLE_AUTOUPDATE: "true",
				OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
				OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
				OPENCODE_DISABLE_AUTOCOMPACT: "true",
				OPENCODE_DISABLE_PRUNE: "true",
				OPENCODE_DISABLE_TERMINAL_TITLE: "true",
				// Disable web features that cause model confusion
				OPENCODE_DISABLE_WEBSEARCH: "true",
				OPENCODE_DISABLE_WEBFETCH: "true",
				OPENCODE_DISABLE_CLAUDE_CODE: "true",
				OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true",
				OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
				...(runtime.name === "vllm" && {
					OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "1024",
				}),
			};

			// Prefer plain code responses even if the model internally uses tools.
			const fullPrompt = `${prompt.trim()}\n\nReturn the final TypeScript code in your response. Do not return status-only messages.`;

			// Run directly in workDir for deterministic local execution
			// --format json provides structured output for reliable parsing
			// --log-level ERROR reduces noise in output
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
			let hasOutput = false;
			let timedOut = false;
			let staleKilled = false;
			let staleTimeoutMs = STALE_OUTPUT_TIMEOUT_MS;
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
					hasOutput = true;
					lastOutputTime = Date.now();
					stdoutChunks.push(chunk.toString());
				});
				proc.stderr?.on("data", (chunk: Buffer) => {
					hasOutput = true;
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
