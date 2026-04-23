/**
 * Purpose: OpenCode CLI adapter implementing the Harness interface.
 * Exports: createOpenCodeAdapter
 *
 * Runs OpenCode directly with generated per-item config:
 * `opencode run --model <provider>/<model> --format json --dir <workspace> <prompt>`
 *
 * Invariants:
 * - The public harness name remains `opencode`.
 * - OpenCode executes from the exact benchmark workspace passed via `--dir`.
 * - Code-output mode prefers `solution.ts`; workspace mode lets the workspace
 *   scorer decide semantic success.
 */

import * as fs from "node:fs";
import { execa } from "execa";
import { logger } from "../lib/logger.js";
import {
	appendSignalAssessmentReasons,
	getTranscriptOrInputTaintReasons,
} from "../lib/signal-assessment.js";
import type {
	SignalAssessment,
	SignalAssessmentReason,
} from "../schemas/index.js";
import {
	appendRetryMarker,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "./code-output-policy.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
import {
	type OpenCodeArtifacts,
	cleanupOpenCodeArtifacts,
	prepareOpenCodeArtifacts,
	readUsableOpenCodeSolution,
} from "./opencode-artifacts.js";
import {
	buildOpenCodeRunArgs,
	getOpenCodeRunFeatures,
	isOpenCodeRunCompatible,
} from "./opencode-cli.js";
import { buildOpenCodeConfig, buildOpenCodeEnv } from "./opencode-config.js";
import {
	type OpenCodeParsedEvents,
	parseOpenCodeEvents,
} from "./opencode-events.js";
import { getOpenCodePermissionTaintReasons } from "./opencode-permissions.js";
import { runOpenCodeCommand } from "./opencode-runner.js";
import { buildToolPrompt, buildWorkspaceToolPrompt } from "./tool-prompt.js";

const MIN_OUTPUT_LENGTH = 10;
const SOLUTION_FILENAME = "solution.ts";

function buildCodeOutputPrompt(
	prompt: string,
	isRetryAttempt: boolean,
): string {
	return buildToolPrompt({
		toolNames: ["write"],
		solutionFilename: SOLUTION_FILENAME,
		taskPrompt: prompt,
		toolUsageHint: [
			`Use relative path "${SOLUTION_FILENAME}".`,
			"Write one complete TypeScript module.",
			isRetryAttempt
				? "Previous output did not produce a usable solution file; write the file now."
				: "",
		]
			.filter((line) => line.length > 0)
			.join(" "),
	});
}

function buildWorkspacePrompt(
	prompt: string,
	workspaceRootPath: string,
): string {
	return buildWorkspaceToolPrompt({
		toolNames: ["read", "edit", "write", "glob", "grep", "bash"],
		taskPrompt: prompt,
		workspaceRootPath,
		pathMode: "relative-only",
		toolUsageHint:
			"Use read/glob/grep to inspect the workspace with relative paths, read any existing file before overwriting it, and use bash for mkdir/delete/move operations when required.",
	});
}

function selectProcessOutput(stdout: string, stderr: string): string {
	if (stdout.trim().length > 0) {
		return stdout;
	}
	return stderr.trim().length >= MIN_OUTPUT_LENGTH ? stderr : stdout;
}

function buildSignalAssessment(
	parsed: OpenCodeParsedEvents,
	stdout: string,
	stderr: string,
	extraReasons: readonly SignalAssessmentReason[] = [],
): SignalAssessment | undefined {
	const stderrReasons = getTranscriptOrInputTaintReasons(stderr).filter(
		(reason) => reason !== "internal_tool_transcript",
	);
	const protocolOnlyReasons =
		parsed.method === "json" && parsed.output.trim().length === 0
			? getTranscriptOrInputTaintReasons(stdout)
			: [];
	const permissionReasons = [
		...getOpenCodePermissionTaintReasons(
			stdout,
			stderr,
			parsed.toolErrorText ?? "",
		),
		...(parsed.permissionDenied ? (["tool_permission_denied"] as const) : []),
	];
	const reasons = Array.from(
		new Set([
			...stderrReasons,
			...getTranscriptOrInputTaintReasons(parsed.output),
			...protocolOnlyReasons,
			...permissionReasons,
			...extraReasons,
		]),
	);
	return reasons.length > 0
		? appendSignalAssessmentReasons(undefined, reasons)
		: undefined;
}

function buildOpenCodeFailure(
	message: string,
	durationMs: number,
	output: string,
	signalAssessment: SignalAssessment | undefined,
): Error {
	return Object.assign(new Error(message), {
		durationMs,
		...(output.trim().length > 0 ? { output } : {}),
		...(signalAssessment ? { signalAssessment } : {}),
	});
}

async function writeSalvagedCode(
	artifacts: OpenCodeArtifacts,
	code: string,
): Promise<string> {
	await fs.promises.writeFile(artifacts.solutionPath, code, "utf-8");
	return artifacts.solutionPath;
}

/**
 * Creates an OpenCode harness adapter.
 *
 * @returns Harness implementation for OpenCode direct CLI mode
 */
export function createOpenCodeAdapter(): Harness {
	return {
		name: "opencode" as const,

		async ping(): Promise<boolean> {
			try {
				try {
					const result = await execa("opencode", ["--version"], {
						timeout: 5000,
					});
					const version = result.stdout.trim();
					const versionMatch = version.match(/(\d+)\.(\d+)/);
					logger.debug(
						{
							version,
							parsedVersion: versionMatch?.[0],
						},
						"Detected OpenCode version",
					);
				} catch (error) {
					logger.debug(
						{ err: error },
						"OpenCode version probe failed; using run feature detection",
					);
				}
				const features = await getOpenCodeRunFeatures();
				return isOpenCodeRunCompatible(features);
			} catch {
				return false;
			}
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const { runtime, model, prompt, timeoutMs } = opts;
			const log = logger.child({ harness: "opencode", model });
			const startTime = performance.now();
			const promptMode = opts.promptMode ?? "code-output";
			const isRetryAttempt = hasRetryMarker(prompt);
			const promptWithoutMarker = stripRetryMarker(prompt);

			if (promptMode === "workspace" && opts.workingDirectory === undefined) {
				throw new Error(
					"OpenCode workspace mode requires a caller-supplied workingDirectory",
				);
			}

			let codeFilePath: string | undefined;
			const artifacts = await prepareOpenCodeArtifacts({
				workingDirectory: opts.workingDirectory,
				solutionFilename: SOLUTION_FILENAME,
			});

			try {
				const configResult = buildOpenCodeConfig({
					runtimeName: runtime.name,
					runtimeBaseUrl: runtime.baseUrl,
					model,
				});
				await fs.promises.writeFile(
					artifacts.configPath,
					JSON.stringify(configResult.config, null, 2),
					"utf-8",
				);

				const env = buildOpenCodeEnv({
					configDir: artifacts.configDir,
					configPath: artifacts.configPath,
					configJson: configResult.configJson,
				});
				const fullPrompt =
					promptMode === "workspace"
						? buildWorkspacePrompt(
								promptWithoutMarker,
								artifacts.executionWorkspaceDir,
							)
						: buildCodeOutputPrompt(promptWithoutMarker, isRetryAttempt);
				const runFeatures = await getOpenCodeRunFeatures();
				const args = buildOpenCodeRunArgs({
					prompt: fullPrompt,
					modelArg: configResult.provider.modelArg,
					executionWorkspaceDir: artifacts.executionWorkspaceDir,
					features: runFeatures,
				});

				log.debug(
					{
						cmd: "opencode",
						modelArg: configResult.provider.modelArg,
						executionWorkspaceDir: artifacts.executionWorkspaceDir,
						configDir: artifacts.configDir,
						supportsPure: runFeatures.supportsPure,
					},
					"Executing OpenCode command",
				);

				const processResult = await runOpenCodeCommand({
					args,
					env,
					cwd: artifacts.executionWorkspaceDir,
					timeoutMs,
					log,
				});
				const durationMs = Math.round(performance.now() - startTime);
				const rawOutput = selectProcessOutput(
					processResult.stdout,
					processResult.stderr,
				);
				const parsed = parseOpenCodeEvents(rawOutput);
				const signalAssessment = buildSignalAssessment(
					parsed,
					processResult.stdout,
					processResult.stderr,
				);

				if (processResult.exitCode !== 0) {
					const stderrPreview = processResult.stderr.trim().slice(0, 800);
					const stdoutPreview = processResult.stdout.trim().slice(0, 800);
					const exitDescription =
						processResult.exitCode === null
							? "process terminated by signal or timed out"
							: `code ${processResult.exitCode}`;
					throw buildOpenCodeFailure(
						`OpenCode exited with ${exitDescription}: ${stderrPreview || "no stderr"}${stdoutPreview ? ` | stdout: ${stdoutPreview}` : ""}`,
						durationMs,
						rawOutput,
						signalAssessment,
					);
				}

				if (processResult.stderr.trim().length > 0) {
					log.warn(
						{ stderr: processResult.stderr.slice(0, 500) },
						"OpenCode produced stderr",
					);
				}

				if (promptMode === "workspace") {
					return {
						output: parsed.output,
						durationMs,
						signalAssessment,
					};
				}

				const solution = await readUsableOpenCodeSolution(
					artifacts.solutionPath,
					MIN_OUTPUT_LENGTH,
				);
				if (solution) {
					codeFilePath = solution.codeFilePath;
					return {
						output: parsed.output,
						durationMs,
						codeFilePath,
						signalAssessment,
					};
				}

				const decision = evaluateCodeOnlyOutput(
					parsed.output,
					MIN_OUTPUT_LENGTH,
				);
				if (
					!decision.shouldRetry &&
					decision.code.length >= MIN_OUTPUT_LENGTH
				) {
					codeFilePath = await writeSalvagedCode(artifacts, decision.code);
					return {
						output: parsed.output,
						durationMs,
						codeFilePath,
						signalAssessment: buildSignalAssessment(
							parsed,
							processResult.stdout,
							processResult.stderr,
							[
								"output_contract_violation",
								...decision.taintReasons,
								...(parsed.method === "tool_call"
									? (["tool_call_not_executed"] as const)
									: []),
							],
						),
					};
				}

				if (decision.shouldRetry && !isRetryAttempt) {
					const elapsedMs = Math.round(performance.now() - startTime);
					const remainingMs = timeoutMs - elapsedMs;
					if (remainingMs > 1000) {
						try {
							const retryResult = await createOpenCodeAdapter().generate({
								...opts,
								prompt: appendRetryMarker(promptWithoutMarker),
								timeoutMs: remainingMs,
							});
							return {
								...retryResult,
								durationMs: Math.round(performance.now() - startTime),
							};
						} catch (error) {
							const totalDurationMs = Math.round(performance.now() - startTime);
							if (error !== null && typeof error === "object") {
								Object.assign(error, { durationMs: totalDurationMs });
							}
							throw error;
						}
					}
				}

				throw buildOpenCodeFailure(
					`OpenCode did not write ${SOLUTION_FILENAME} and no usable code output was produced`,
					durationMs,
					parsed.output,
					signalAssessment,
				);
			} finally {
				await cleanupOpenCodeArtifacts(artifacts, {
					preserveWorkspace:
						artifacts.hasExternalWorkspace || codeFilePath !== undefined,
				});
			}
		},
	};
}
