/**
 * Purpose: Hermes CLI adapter implementing the Harness interface.
 * Exports: createHermesAdapter
 *
 * Invariants:
 * - Hermes runs through `hermes chat` with an isolated HERMES_HOME per item.
 * - Model discovery remains owned by Runtime adapters.
 * - Code-output mode trusts `solution.ts`, not Hermes stdout salvage.
 * - Workspace mode runs in a Hermes-safe mirror and syncs changes back.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { hasRetryMarker, stripRetryMarker } from "./code-output-policy.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
import {
	buildHermesRunArgs,
	getHermesRunFeatures,
	isHermesRunCompatible,
} from "./hermes-cli.js";

const SOLUTION_FILENAME = "solution.ts";
const MIN_OUTPUT_LENGTH = 10;
const DEFAULT_HERMES_MAX_TURNS = 1;
const DEFAULT_HERMES_RETRY_MAX_TURNS = 3;
const DEFAULT_HERMES_WORKSPACE_MAX_TURNS = 8;
const DEFAULT_HERMES_WORKSPACE_RETRY_MAX_TURNS = 12;
const HERMES_GENERATED_WORK_DIR_ROOT =
	process.platform === "darwin" ? "/tmp" : os.tmpdir();

function toOpenAiCompatibleBaseUrl(baseUrl: string): string {
	const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
	if (trimmedBaseUrl.length === 0) {
		throw new Error("Hermes requires a non-empty runtime baseUrl");
	}
	return trimmedBaseUrl.endsWith("/v1")
		? trimmedBaseUrl
		: `${trimmedBaseUrl}/v1`;
}

function quoteYamlString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function createHermesHome(
	runtimeBaseUrl: string,
	model: string,
): Promise<string> {
	const hermesHome = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "plebdev-bench-hermes-home-"),
	);
	const config = [
		"model:",
		`  default: ${quoteYamlString(model)}`,
		'  provider: "custom"',
		`  base_url: ${quoteYamlString(toOpenAiCompatibleBaseUrl(runtimeBaseUrl))}`,
		"",
	].join("\n");
	await fs.promises.writeFile(path.join(hermesHome, "config.yaml"), config);
	return hermesHome;
}

async function createHermesWorkspaceMirror(
	sourceWorkspaceDir: string,
): Promise<string> {
	const mirrorDir = await fs.promises.mkdtemp(
		path.join(
			HERMES_GENERATED_WORK_DIR_ROOT,
			"plebdev-bench-hermes-workspace-",
		),
	);
	await fs.promises.cp(sourceWorkspaceDir, mirrorDir, {
		recursive: true,
		force: true,
	});
	return mirrorDir;
}

async function replaceWorkspaceContents(
	sourceWorkspaceDir: string,
	targetWorkspaceDir: string,
): Promise<void> {
	await fs.promises.rm(targetWorkspaceDir, { recursive: true, force: true });
	await fs.promises.mkdir(path.dirname(targetWorkspaceDir), {
		recursive: true,
	});
	await fs.promises.cp(sourceWorkspaceDir, targetWorkspaceDir, {
		recursive: true,
		force: true,
	});
}

/** Configuration for Hermes turn limits across attempts. */
export interface HermesAdapterOptions {
	/** Maximum Hermes turns for the first code-output attempt. */
	maxTurns?: number;
	/** Maximum Hermes turns for the retry code-output attempt. */
	retryMaxTurns?: number;
	/** Maximum Hermes turns for the first workspace attempt. */
	workspaceMaxTurns?: number;
	/** Maximum Hermes turns for the retry workspace attempt. */
	workspaceRetryMaxTurns?: number;
}

/** Runtime-validated Hermes adapter options. */
const HermesAdapterOptionsSchema = z
	.object({
		maxTurns: z.number().int().positive().optional(),
		retryMaxTurns: z.number().int().positive().optional(),
		workspaceMaxTurns: z.number().int().positive().optional(),
		workspaceRetryMaxTurns: z.number().int().positive().optional(),
	})
	.strict();

/**
 * Builds the code-output prompt contract for Hermes runs.
 *
 * @param prompt - Benchmark task prompt
 * @returns Tool-oriented prompt string that requires writing `solution.ts`
 * @throws {never} This helper only formats prompt text
 */
function buildHermesCodeOutputPrompt(prompt: string): string {
	return [
		`Use the write_file tool to create ${SOLUTION_FILENAME} in the current directory.`,
		"Write only the complete TypeScript module required by the task as the file content.",
		"Do not print a textual write_file(...) call; invoke the actual tool.",
		"Do not print code in chat. After the file is written, reply DONE.",
		"",
		"TASK:",
		prompt.trim(),
	].join("\n");
}

/**
 * Builds the workspace prompt contract for Hermes runs.
 *
 * @param prompt - Benchmark task prompt
 * @param workspaceRootPath - Workspace root path passed to Hermes
 * @returns Tool-oriented workspace prompt string
 * @throws {never} This helper only formats prompt text
 */
function buildHermesWorkspacePrompt(
	prompt: string,
	workspaceRootPath: string,
): string {
	return [
		"Use actual file tools in the current directory.",
		"Use relative paths only. Do not inspect parent directories.",
		"Do not print tool-call syntax. Invoke the actual tools.",
		"Do not print file contents or patches in chat.",
		"After the requested filesystem changes are complete, reply DONE.",
		"",
		"TASK:",
		prompt.trim(),
		"",
		`Workspace root for orientation only: ${workspaceRootPath}`,
	].join("\n");
}

/**
 * Builds diagnostic process output for structured Hermes failures.
 *
 * @param stdout - Captured Hermes stdout
 * @param stderr - Captured Hermes stderr
 * @returns Combined diagnostic output, or undefined when both streams are empty
 */
function buildProcessEvidence(
	stdout: string | undefined,
	stderr: string | undefined,
): string | undefined {
	const parts = [
		stdout?.trim() ? `stdout:\n${stdout.trim()}` : "",
		stderr?.trim() ? `stderr:\n${stderr.trim()}` : "",
	].filter((part) => part.length > 0);
	return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function hasTextualToolCallOutput(output: string): boolean {
	return /\b(?:read_file|write_file|patch|search_files)\s*(?:\(|\{)/.test(
		output,
	);
}

/**
 * Creates a structured Hermes generation failure for runner serialization.
 *
 * @param message - Human-readable failure message
 * @param durationMs - Observed generation duration
 * @param output - Optional diagnostic process output
 * @returns Error with structured generation failure fields
 */
function buildHermesFailure(
	message: string,
	durationMs: number,
	output: string | undefined,
): Error & {
	failureType: "harness_error";
	durationMs: number;
	output?: string;
} {
	return Object.assign(new Error(message), {
		failureType: "harness_error" as const,
		durationMs,
		...(output !== undefined ? { output } : {}),
	});
}

/**
 * Creates a Hermes harness adapter.
 *
 * @returns Harness implementation for Hermes CLI mode
 */
export function createHermesAdapter(options?: HermesAdapterOptions): Harness {
	const parsedOptions = HermesAdapterOptionsSchema.parse(
		options === undefined ? {} : options,
	);
	const maxTurns = parsedOptions.maxTurns ?? DEFAULT_HERMES_MAX_TURNS;
	const retryMaxTurns =
		parsedOptions.retryMaxTurns ?? DEFAULT_HERMES_RETRY_MAX_TURNS;
	if (retryMaxTurns < maxTurns) {
		throw new TypeError(
			`hermes.retryMaxTurns must be greater than or equal to hermes.maxTurns (maxTurns=${maxTurns}, retryMaxTurns=${retryMaxTurns})`,
		);
	}
	const workspaceMaxTurns =
		parsedOptions.workspaceMaxTurns ?? DEFAULT_HERMES_WORKSPACE_MAX_TURNS;
	const workspaceRetryMaxTurns =
		parsedOptions.workspaceRetryMaxTurns ??
		DEFAULT_HERMES_WORKSPACE_RETRY_MAX_TURNS;
	if (workspaceRetryMaxTurns < workspaceMaxTurns) {
		throw new TypeError(
			`hermes.workspaceRetryMaxTurns must be greater than or equal to hermes.workspaceMaxTurns (workspaceMaxTurns=${workspaceMaxTurns}, workspaceRetryMaxTurns=${workspaceRetryMaxTurns})`,
		);
	}

	return {
		name: "hermes" as const,

		async ping(): Promise<boolean> {
			try {
				const features = await getHermesRunFeatures();
				return isHermesRunCompatible(features);
			} catch {
				return false;
			}
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const startTime = performance.now();
			const promptMode = opts.promptMode ?? "code-output";
			const isRetryAttempt = hasRetryMarker(opts.prompt);
			const promptWithoutMarker = stripRetryMarker(opts.prompt);
			const maxTurnsForAttempt =
				promptMode === "workspace"
					? isRetryAttempt
						? workspaceRetryMaxTurns
						: workspaceMaxTurns
					: isRetryAttempt
						? retryMaxTurns
						: maxTurns;
			const callerWorkspaceDir =
				promptMode === "workspace" ? opts.workingDirectory : undefined;
			if (promptMode === "workspace" && callerWorkspaceDir === undefined) {
				throw new Error(
					"Hermes workspace mode requires a caller-supplied workingDirectory",
				);
			}
			const workspaceMirrorDir =
				callerWorkspaceDir !== undefined
					? await createHermesWorkspaceMirror(callerWorkspaceDir)
					: undefined;
			const workDir =
				workspaceMirrorDir ??
				opts.workingDirectory ??
				(await fs.promises.mkdtemp(
					path.join(HERMES_GENERATED_WORK_DIR_ROOT, "plebdev-bench-hermes-"),
				));
			await fs.promises.mkdir(workDir, { recursive: true });
			const solutionPath = path.join(workDir, SOLUTION_FILENAME);
			const features = await getHermesRunFeatures();
			const args = buildHermesRunArgs({
				prompt:
					promptMode === "workspace"
						? buildHermesWorkspacePrompt(promptWithoutMarker, workDir)
						: buildHermesCodeOutputPrompt(promptWithoutMarker),
				model: opts.model,
				maxTurns: maxTurnsForAttempt,
				features,
			});
			const env: NodeJS.ProcessEnv = {
				...process.env,
			};
			const hermesHome = await createHermesHome(
				opts.runtime.baseUrl,
				opts.model,
			);
			let result: { stdout: string; stderr: string };
			try {
				result = await execa("hermes", args, {
					cwd: workDir,
					env: {
						...env,
						HERMES_HOME: hermesHome,
					},
					timeout: opts.timeoutMs,
					reject: true,
					forceKillAfterDelay: 5000,
				});
				if (
					promptMode === "workspace" &&
					hasTextualToolCallOutput(result.stdout)
				) {
					const durationMs = Math.round(performance.now() - startTime);
					throw buildHermesFailure(
						"Hermes printed textual tool-call syntax instead of invoking workspace tools",
						durationMs,
						buildProcessEvidence(result.stdout, result.stderr),
					);
				}
				if (
					workspaceMirrorDir !== undefined &&
					callerWorkspaceDir !== undefined
				) {
					await replaceWorkspaceContents(
						workspaceMirrorDir,
						callerWorkspaceDir,
					);
				}
			} finally {
				await fs.promises.rm(hermesHome, { recursive: true, force: true });
				if (workspaceMirrorDir !== undefined) {
					await fs.promises.rm(workspaceMirrorDir, {
						recursive: true,
						force: true,
					});
				}
			}
			const durationMs = Math.round(performance.now() - startTime);
			if (promptMode === "workspace") {
				return {
					output: result.stdout,
					durationMs,
				};
			}

			let code: string;
			try {
				code = await fs.promises.readFile(solutionPath, "utf-8");
			} catch {
				throw buildHermesFailure(
					`Hermes did not produce required ${SOLUTION_FILENAME}`,
					durationMs,
					buildProcessEvidence(result.stdout, result.stderr),
				);
			}

			if (code.trim().length < MIN_OUTPUT_LENGTH) {
				throw buildHermesFailure(
					`Hermes produced empty or too-short ${SOLUTION_FILENAME}`,
					durationMs,
					buildProcessEvidence(result.stdout, result.stderr),
				);
			}

			return {
				output: code,
				durationMs,
				codeFilePath: solutionPath,
			};
		},
	};
}
