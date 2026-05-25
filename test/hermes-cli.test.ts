/**
 * Purpose: Behavior tests for Hermes CLI feature parsing and argv building.
 * Exports: none
 *
 * Invariants:
 * - Tests do not spawn Hermes.
 * - Compatibility is based on exact headless chat flags, not command presence.
 */

import { describe, expect, it } from "vitest";
import {
	buildHermesRunArgs,
	isHermesRunCompatible,
	parseHermesRunFeatures,
} from "../src/harnesses/hermes-cli.js";

describe("Hermes CLI helpers", () => {
	it("parses required and optional chat flags from help text", () => {
		const features = parseHermesRunFeatures(
			"--query prompt\n--model model\n--provider ollama\n--toolsets file\n--quiet\n--yolo\n--accept-hooks\n--max-turns 3",
		);

		expect(isHermesRunCompatible(features)).toBe(true);
		expect(features.supportsMaxTurns).toBe(true);
	});

	it("does not infer run flags from longer option names", () => {
		const features = parseHermesRunFeatures(
			"--modeler model\n--provider-name ollama\n--cwdish path\n--yesterday\n--max-turnstile 3",
		);

		expect(features).toEqual({
			supportsModel: false,
			supportsProvider: false,
			supportsQuery: false,
			supportsToolsets: false,
			supportsQuiet: false,
			supportsYolo: false,
			supportsAcceptHooks: false,
			supportsMaxTurns: false,
		});
		expect(isHermesRunCompatible(features)).toBe(false);
	});

	it("builds deterministic headless chat args for Ollama models", () => {
		const args = buildHermesRunArgs({
			prompt: "Write solution.ts.",
			model: "qwen3.5:4b",
			maxTurns: 1,
			features: {
				supportsModel: true,
				supportsProvider: true,
				supportsQuery: true,
				supportsToolsets: true,
				supportsQuiet: true,
				supportsYolo: true,
				supportsAcceptHooks: true,
				supportsMaxTurns: true,
			},
		});

		expect(args).toEqual([
			"chat",
			"--provider",
			"custom",
			"--model",
			"qwen3.5:4b",
			"--toolsets",
			"file",
			"--quiet",
			"--yolo",
			"--accept-hooks",
			"--max-turns",
			"1",
			"--query",
			"Write solution.ts.",
		]);
	});

	it("rejects argv construction when required flags are unsupported", () => {
		expect(() =>
			buildHermesRunArgs({
				prompt: "Write solution.ts.",
				model: "qwen3.5:4b",
				features: {
					supportsModel: true,
					supportsProvider: true,
					supportsQuery: false,
					supportsToolsets: true,
					supportsQuiet: true,
					supportsYolo: true,
					supportsAcceptHooks: true,
					supportsMaxTurns: false,
				},
			}),
		).toThrow(/missing --query/);
	});
});
