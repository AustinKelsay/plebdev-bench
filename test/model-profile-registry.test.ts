/**
 * Purpose: Validate model-profile registry parsing and provenance behavior.
 * Exports: none
 *
 * Invariants:
 * - Versioned model-profile files reject unknown schema versions
 * - Reverse runtime-model matches must be unambiguous
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFallbackModelProfile } from "../src/lib/model-profile/normalization.js";
import {
	buildResolvedModelProfile,
	loadModelProfiles,
	parseInlineModelProfile,
	resolveModelSelection,
} from "../src/lib/model-profiles.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";
import {
	ConfiguredModelProfileSchema,
	ModelProfileFileSchema,
} from "../src/schemas/model-profile.schema.js";

describe("parseInlineModelProfile", () => {
	it("rejects unknown runtimes in inline mappings", () => {
		expect(() =>
			parseInlineModelProfile("qwen3-27b=mlx:Qwen/Qwen3-27B-Instruct"),
		).toThrow('unknown runtime "mlx"');
	});

	it("rejects duplicate runtimes in inline mappings", () => {
		expect(() =>
			parseInlineModelProfile("qwen3-27b=ollama:qwen3:27b,ollama:qwen3:27b-q4"),
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

	it("loads legacy profile files with unsupported runtime keys by ignoring them", () => {
		const tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "plebdev-bench-model-profiles-"),
		);
		try {
			const profilePath = path.join(tempDir, "models.json");
			fs.writeFileSync(
				profilePath,
				JSON.stringify(
					{
						schemaVersion: SCHEMA_VERSION,
						models: {
							"qwen3-27b-instruct": {
								profileLabel: "Qwen 3 27B Instruct",
								family: "qwen3",
								variants: {
									ollama: "qwen3:27b",
									vllm: "Qwen/Qwen3-27B-Instruct",
								},
							},
							"legacy-vllm-only": {
								profileLabel: "Legacy vLLM Only",
								family: "qwen3",
								variants: {
									vllm: "Qwen/Qwen3-32B-Instruct",
								},
							},
						},
					},
					null,
					2,
				),
			);

			const registry = loadModelProfiles(profilePath);
			expect(registry["qwen3-27b-instruct"]?.variants.ollama).toBe("qwen3:27b");
			expect(
				Object.prototype.hasOwnProperty.call(
					registry["qwen3-27b-instruct"]?.variants ?? {},
					"vllm",
				),
			).toBe(false);
			expect(registry["legacy-vllm-only"]).toBeUndefined();
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
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

	it("derives minimal configured profile family metadata from the profile key", () => {
		const profile = buildResolvedModelProfile("ollama", "qwen3:1.25b", {
			"qwen3-1.25b-instruct": {
				variants: {
					ollama: "qwen3:1.25b",
				},
			},
		});

		expect(profile.canonical.family).toBe("qwen3");
		expect(profile.canonical.parametersBillions).toBe(1.25);
		expect(profile.canonical.tuning).toBe("instruct");
	});
});

describe("ModelProfileFileSchema", () => {
	it("rejects unsupported schema versions", () => {
		expect(
			ModelProfileFileSchema.safeParse({
				schemaVersion: "0.4.0",
				models: {},
			}).success,
		).toBe(false);
	});

	it("rejects invalid runtime keys in configured variants", () => {
		expect(
			ConfiguredModelProfileSchema.safeParse({
				variants: {
					mlx: "Qwen/Qwen3-27B-Instruct-MLX",
				},
			}).success,
		).toBe(false);
		expect(
			ConfiguredModelProfileSchema.safeParse({
				variants: {
					vllm: "Qwen/Qwen3-27B-Instruct",
				},
			}).success,
		).toBe(false);
	});

	it("accepts legacy artifact runtime keys in persisted files", () => {
		expect(
			ModelProfileFileSchema.safeParse({
				schemaVersion: SCHEMA_VERSION,
				models: {
					"qwen3-27b-instruct": {
						variants: {
							ollama: "qwen3:27b",
							vllm: "Qwen/Qwen3-27B-Instruct",
						},
					},
				},
			}).success,
		).toBe(true);
	});
});

describe("buildResolvedModelProfile", () => {
	it("rejects ambiguous reverse runtime-model matches", () => {
		expect(() =>
			buildResolvedModelProfile("ollama", "qwen3:27b", {
				"qwen3-27b-a": {
					profileLabel: "Qwen 3 27B A",
					family: "qwen3",
					variants: {
						ollama: "qwen3:27b",
					},
				},
				"qwen3-27b-b": {
					profileLabel: "Qwen 3 27B B",
					family: "qwen3",
					variants: {
						ollama: "qwen3:27b",
					},
				},
			}),
		).toThrow("Ambiguous configured model profile reverse match");
	});
});
