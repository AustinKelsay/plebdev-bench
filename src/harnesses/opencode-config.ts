/**
 * Purpose: OpenCode generated config/env builders for benchmark runs.
 * Exports: BuildOpenCodeConfigOpts, OpenCodeConfigBuildResult,
 *          buildOpenCodeConfig, buildOpenCodeEnv
 *
 * Invariants:
 * - Config is generated per item and isolated from user-global providers.
 * - Permissions use current `permission` config, not deprecated top-level tools.
 * - Provider config preserves runtime model names behind slash-safe CLI keys.
 */

import { z } from "zod";
import {
	type OpenCodePermissionPolicy,
	createOpenCodePermissionPolicy,
} from "./opencode-permissions.js";
import {
	type OpenCodeProviderSpec,
	buildOpenCodeProviderSpec,
} from "./opencode-provider.js";

const RuntimeNameSchema = z.literal("ollama");

const BuildOpenCodeConfigOptsSchema = z.object({
	runtimeName: RuntimeNameSchema,
	runtimeBaseUrl: z.string().min(1),
	model: z.string().min(1),
});

export type BuildOpenCodeConfigOpts = z.infer<
	typeof BuildOpenCodeConfigOptsSchema
>;

/** Generated OpenCode config artifacts. */
export interface OpenCodeConfigBuildResult {
	/** Config object safe to serialize to `opencode.json`. */
	config: unknown;
	/** Compact JSON config content for `OPENCODE_CONFIG_CONTENT`. */
	configJson: string;
	/** Provider spec used for CLI args and config. */
	provider: OpenCodeProviderSpec;
	/** Permission policy embedded in the config. */
	permission: OpenCodePermissionPolicy;
}

/**
 * Builds the generated OpenCode config for one benchmark item.
 *
 * @param opts - Runtime/model inputs
 * @returns Config object, serialized config, provider spec, and permission policy
 * @throws z.ZodError when options fail validation
 * @throws {Error} when provider URL/model normalization fails
 */
export function buildOpenCodeConfig(
	opts: BuildOpenCodeConfigOpts,
): OpenCodeConfigBuildResult {
	const parsed = BuildOpenCodeConfigOptsSchema.parse(opts);
	const provider = buildOpenCodeProviderSpec(parsed);
	const permission = createOpenCodePermissionPolicy();
	const modelConfig = {
		name: provider.runtimeModelName,
		tools: true,
	};

	const config = {
		$schema: "https://opencode.ai/config.json",
		enabled_providers: [provider.providerId],
		model: provider.modelArg,
		provider: {
			[provider.providerId]: {
				npm: provider.npmPackage,
				name: provider.providerName,
				options: {
					baseURL: provider.baseURL,
				},
				models: {
					[provider.transportModelKey]: modelConfig,
					...(provider.transportModelKey !== provider.runtimeModelName
						? { [provider.runtimeModelName]: modelConfig }
						: {}),
				},
			},
		},
		permission,
	};

	return {
		config,
		configJson: JSON.stringify(config),
		provider,
		permission,
	};
}

/**
 * Builds environment overrides for a headless OpenCode run.
 *
 * @param opts - Generated config directory/path/content and runtime name
 * @returns Environment variables for `execa`
 * @throws z.ZodError when inputs fail validation
 */
export function buildOpenCodeEnv(opts: {
	configDir: string;
	configPath: string;
	configJson: string;
	runtimeName: "ollama";
}): Record<string, string> {
	const parsed = z
		.object({
			configDir: z.string().min(1),
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
		OPENCODE_CONFIG_DIR: parsed.configDir,
		OPENCODE_CONFIG: parsed.configPath,
		OPENCODE_CONFIG_CONTENT: parsed.configJson,
		OPENCODE_DISABLE_AUTOUPDATE: "true",
		OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
		OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
		OPENCODE_DISABLE_WEBSEARCH: "true",
		OPENCODE_DISABLE_WEBFETCH: "true",
		OPENCODE_DISABLE_AUTOCOMPACT: "true",
		OPENCODE_DISABLE_PRUNE: "true",
		OPENCODE_DISABLE_TERMINAL_TITLE: "true",
		OPENCODE_DISABLE_CLAUDE_CODE: "true",
		OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true",
		OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
	};
}
