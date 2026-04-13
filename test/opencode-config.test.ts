/**
 * Purpose: Regression tests for OpenCode workspace tool configuration.
 */

import { describe, expect, it } from "vitest";
import { buildOpenCodeConfig } from "../src/harnesses/opencode-config.js";

describe("buildOpenCodeConfig", () => {
	it("enables workspace tools and bash permissions for benchmark runs", () => {
		const { config } = buildOpenCodeConfig({
			runtimeName: "ollama",
			runtimeBaseUrl: "http://localhost:11434",
			model: "qwen3.5:4b",
		});

		const typedConfig = config as {
			permission: Record<string, string>;
			tools: Record<string, boolean>;
		};

		expect(typedConfig.permission.bash).toBe("allow");
		expect(typedConfig.tools.read).toBe(true);
		expect(typedConfig.tools.bash).toBe(true);
		expect(typedConfig.tools.glob).toBe(true);
		expect(typedConfig.tools.grep).toBe(true);
	});
});
