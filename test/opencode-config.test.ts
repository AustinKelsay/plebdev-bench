/**
 * Purpose: Regression tests for generated OpenCode config/env isolation.
 * Exports: none
 *
 * Invariants:
 * - Generated config remains self-contained and independent of user-global config.
 * - Permission policy keeps external directories and interactive tools denied.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildOpenCodeConfig,
	buildOpenCodeEnv,
} from "../src/harnesses/opencode-config.js";

describe("buildOpenCodeConfig", () => {
	it("declares inline runtime models without relying on global config", () => {
		const { config, provider, permission } = buildOpenCodeConfig({
			runtimeName: "ollama",
			runtimeBaseUrl: "http://localhost:11434",
			model: "Qwen/Qwen2.5-14B-Instruct",
		});
		const typedConfig = config as {
			enabled_providers: string[];
			model: string;
			provider: Record<
				string,
				{
					options: { baseURL: string };
					models: Record<string, { name: string; tools: boolean }>;
				}
			>;
			permission: Record<string, string>;
			tools?: unknown;
		};

		expect(provider.modelArg).toBe("ollama/Qwen%2FQwen2.5-14B-Instruct");
		expect(typedConfig.provider.ollama?.options.baseURL).toBe(
			"http://localhost:11434/v1",
		);
		expect(typedConfig.enabled_providers).toEqual(["ollama"]);
		expect(typedConfig.model).toBe("ollama/Qwen%2FQwen2.5-14B-Instruct");
		expect(
			typedConfig.provider.ollama?.models["Qwen%2FQwen2.5-14B-Instruct"],
		).toEqual({
			name: "Qwen/Qwen2.5-14B-Instruct",
			tools: true,
		});
		expect(typedConfig.tools).toBeUndefined();
		expect(typedConfig.permission).toEqual(permission);
	});

	it("denies external directories and user-interaction tools", () => {
		const { permission } = buildOpenCodeConfig({
			runtimeName: "ollama",
			runtimeBaseUrl: "http://localhost:11434",
			model: "qwen3.5:4b",
		});

		expect(permission).toMatchObject({
			"*": "allow",
			external_directory: "deny",
			question: "deny",
			task: "deny",
			skill: "deny",
			webfetch: "deny",
			websearch: "deny",
			codesearch: "deny",
			lsp: "deny",
		});
	});

	it("uses trimmed model names in provider config and model args", () => {
		const { config, provider } = buildOpenCodeConfig({
			runtimeName: "ollama",
			runtimeBaseUrl: "http://localhost:11434",
			model: "  Qwen/Qwen2.5-14B-Instruct  ",
		});
		const typedConfig = config as {
			model: string;
			provider: {
				ollama?: {
					models: Record<string, { name: string; tools: boolean }>;
				};
			};
		};

		expect(provider.runtimeModelName).toBe("Qwen/Qwen2.5-14B-Instruct");
		expect(typedConfig.model).toBe("ollama/Qwen%2FQwen2.5-14B-Instruct");
		expect(
			typedConfig.provider.ollama?.models["Qwen%2FQwen2.5-14B-Instruct"],
		).toEqual({
			name: "Qwen/Qwen2.5-14B-Instruct",
			tools: true,
		});
	});
});

describe("buildOpenCodeEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("exports config dir/path/content for isolated headless runs", () => {
		vi.stubEnv("OPENCODE_CONFIG", "/tmp/user-opencode.json");
		vi.stubEnv("OPENCODE_DISABLE_WEBSEARCH", "false");
		vi.stubEnv("OPENCODE_USER_SETTING", "leak");
		const env = buildOpenCodeEnv({
			configDir: "/tmp/opencode-config",
			configPath: "/tmp/opencode-config/opencode.json",
			configJson: '{"permission":{"*":"allow"}}',
		});

		expect(env.OPENCODE_CONFIG_DIR).toBe("/tmp/opencode-config");
		expect(env.OPENCODE_CONFIG).toBe("/tmp/opencode-config/opencode.json");
		expect(env.OPENCODE_CONFIG_CONTENT).toBe('{"permission":{"*":"allow"}}');
		expect(env.OPENCODE_DISABLE_AUTOUPDATE).toBe("true");
		expect(env.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe("true");
		expect(env.OPENCODE_DISABLE_WEBSEARCH).toBe("true");
		expect(env.OPENCODE_USER_SETTING).toBeUndefined();
	});
});
