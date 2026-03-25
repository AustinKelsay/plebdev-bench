/**
 * Purpose: Validate model-profile registry parsing and provenance behavior.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildResolvedModelProfile,
	loadModelProfiles,
	parseInlineModelProfile,
	resolveModelSelection,
} from "../src/lib/model-profiles.js";
import { buildFallbackModelProfile } from "../src/lib/model-profile/normalization.js";

describe("parseInlineModelProfile", () => {
	it("rejects unknown runtimes in inline mappings", () => {
		expect(() =>
			parseInlineModelProfile("qwen3-27b=mlx:Qwen/Qwen3-27B-Instruct"),
		).toThrow('unknown runtime "mlx"');
	});

	it("rejects duplicate runtimes in inline mappings", () => {
		expect(() =>
			parseInlineModelProfile(
				"qwen3-27b=ollama:qwen3:27b,ollama:qwen3:27b-q4",
			),
		).toThrow('duplicate runtime "ollama"');
	});
});

describe("model-profile registry provenance", () => {
	it("marks legacy alias-derived selections explicitly", () => {
		const tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-bench-model-profiles-"),
		);
		try {
			const aliasPath = path.join(tempDir, "aliases.json");
			fs.writeFileSync(
				aliasPath,
				JSON.stringify(
					{
						"qwen3-27b-instruct": {
							ollama: "qwen3:27b",
						},
					},
					null,
					2,
				),
			);
			const registry = loadModelProfiles(aliasPath);
			const selection = resolveModelSelection(
				"qwen3-27b-instruct",
				"ollama",
				registry,
			);

			expect(selection?.modelProfile.resolutionSource).toBe("legacy_alias");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("defaults plain configured registries to configured-profile provenance", () => {
		const selection = buildResolvedModelProfile("ollama", "qwen3:27b", {
			"qwen3-27b-instruct": {
				profileLabel: "Qwen 3 27B Instruct",
				family: "qwen3",
				variants: {
					ollama: "qwen3:27b",
				},
			},
		});

		expect(selection.resolutionSource).toBe("configured_profile");
	});
});

describe("model-profile normalization", () => {
	it("preserves fractional parameter precision in fallback profile keys", () => {
		const profile = buildFallbackModelProfile(
			"ollama",
			"qwen3-1250m-instruct-gguf",
		);

		expect(profile.canonical.profileKey).toBe("qwen3-1.25b-instruct");
		expect(profile.canonical.parameterScaleLabel).toBe("1.25B");
	});
});
