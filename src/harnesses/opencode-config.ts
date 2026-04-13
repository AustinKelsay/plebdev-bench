/**
 * Purpose: OpenCode config/env builders (pure-ish helpers).
 * Exports: buildOpenCodeConfig, buildOpenCodeEnv, resolveOpenCodeToolOutputRoot
 *
 * OpenCode expects an on-disk config file (opencode.json) and optionally accepts
 * config content via env vars. This module standardizes how we generate those.
 *
 * Invariants:
 * - Tool output root is always a stable XDG data home path (non-interactive)
 * - OpenCode always targets Ollama through its OpenAI-compatible `/v1` surface
 */

import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { toOpenAiCompatBaseUrl, toOpenCodeModelKey } from "./opencode-model.js";

/** OpenCode tool-output root subpath within XDG data home. */
const OPENCODE_TOOL_OUTPUT_SUBPATH = path.join("opencode", "tool-output");

const RuntimeNameSchema = z.literal("ollama");

const BuildOpenCodeConfigOptsSchema = z.object({
	runtimeName: RuntimeNameSchema,
	runtimeBaseUrl: z.string().min(1),
	model: z.string().min(1),
});

export type BuildOpenCodeConfigOpts = z.infer<
	typeof BuildOpenCodeConfigOptsSchema
>;

export interface OpenCodeConfigBuildResult {
	config: unknown;
	configJson: string;
}

/**
 * Resolve OpenCode's tool-output root directory.
 *
 * @returns Absolute path to tool-output root directory
 * @throws z.ZodError when the environment shape is unexpected (defensive; should not happen in Node).
 */
export function resolveOpenCodeToolOutputRoot(): string {
	z.object({ XDG_DATA_HOME: z.string().optional() })
		.passthrough()
		.parse(process.env);

	const xdgDataHome =
		typeof process.env.XDG_DATA_HOME === "string" &&
		process.env.XDG_DATA_HOME.trim().length > 0
			? process.env.XDG_DATA_HOME.trim()
			: path.join(os.homedir(), ".local", "share");

	return path.join(xdgDataHome, OPENCODE_TOOL_OUTPUT_SUBPATH);
}

/**
 * Build the OpenCode config object + JSON for `opencode.json`.
 *
 * @param opts - Runtime/model inputs
 * @returns Config object and its JSON representation
 * @throws z.ZodError when `opts` fails validation.
 * @throws Error when `toOpenAiCompatBaseUrl` rejects `runtimeBaseUrl`.
 * @throws Error when `toOpenCodeModelKey` rejects `model`.
 */
export function buildOpenCodeConfig(
	opts: BuildOpenCodeConfigOpts,
): OpenCodeConfigBuildResult {
	const { runtimeName, runtimeBaseUrl, model } =
		BuildOpenCodeConfigOptsSchema.parse(opts);

	const baseURL = toOpenAiCompatBaseUrl(runtimeBaseUrl);
	const providerOptions: Record<string, string> = { baseURL };

	const modelKey = toOpenCodeModelKey(model);

	const config = {
		$schema: "https://opencode.ai/config.json",
		provider: {
			[runtimeName]: {
				npm: "@ai-sdk/openai-compatible",
				name: "Ollama (local)",
				options: providerOptions,
				models: {
					[model]: { name: model, tools: true },
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
			bash: "allow",
			question: "deny",
			websearch: "deny",
			webfetch: "deny",
		},
		tools: {
			edit: true,
			write: true,
			read: true,
			bash: true,
			question: false,
			websearch: false,
			webfetch: false,
			glob: true,
			grep: true,
			task: false,
		},
	};

	return { config, configJson: JSON.stringify(config) };
}

/**
 * Build a headless env for running OpenCode.
 *
 * @param configPath - Absolute path to `opencode.json`
 * @param configJson - JSON string form of the config (best-effort)
 * @param runtimeName - Runtime name for runtime-specific tuning
 * @returns Env overrides suitable for execa
 * @throws z.ZodError when inputs fail validation.
 */
export function buildOpenCodeEnv(opts: {
	configPath: string;
	configJson: string;
	runtimeName: "ollama";
}): Record<string, string> {
	const { configPath, configJson, runtimeName } = z
		.object({
			configPath: z.string().min(1),
			configJson: z.string().min(1),
			runtimeName: RuntimeNameSchema,
		})
		.parse(opts);

	const safeEnv = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

	return {
		...safeEnv,
		OPENCODE_CONFIG: configPath,
		OPENCODE_CONFIG_CONTENT: configJson,
		OPENCODE_DISABLE_AUTOUPDATE: "true",
		OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
		OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
		OPENCODE_DISABLE_AUTOCOMPACT: "true",
		OPENCODE_DISABLE_PRUNE: "true",
		OPENCODE_DISABLE_TERMINAL_TITLE: "true",
		OPENCODE_DISABLE_WEBSEARCH: "true",
		OPENCODE_DISABLE_WEBFETCH: "true",
		OPENCODE_DISABLE_CLAUDE_CODE: "true",
		OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true",
		OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
	};
}
