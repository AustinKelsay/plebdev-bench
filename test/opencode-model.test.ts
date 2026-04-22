/**
 * Purpose: Unit tests for OpenCode provider/model normalization.
 * Exports: none
 *
 * Invariants:
 * - Runtime model IDs map to stable OpenCode provider keys.
 * - OpenAI-compatible base URLs are normalized deterministically.
 */

import { describe, expect, it } from "vitest";
import {
	buildOpenCodeProviderSpec,
	toOpenAiCompatBaseUrl,
	toOpenCodeModelKey,
} from "../src/harnesses/opencode-provider.js";

describe("toOpenAiCompatBaseUrl", () => {
	it("appends /v1 when missing", () => {
		expect(toOpenAiCompatBaseUrl("http://localhost:11434")).toBe(
			"http://localhost:11434/v1",
		);
	});

	it("keeps existing /v1 and trims trailing slashes", () => {
		expect(toOpenAiCompatBaseUrl("http://localhost:8000/v1/")).toBe(
			"http://localhost:8000/v1",
		);
	});

	it("throws for empty URLs", () => {
		expect(() => toOpenAiCompatBaseUrl("   ")).toThrow(
			"OpenCode base URL must be non-empty",
		);
	});
});

describe("toOpenCodeModelKey", () => {
	it("preserves models without slash separators", () => {
		expect(toOpenCodeModelKey("qwen2.5:14b")).toBe("qwen2.5:14b");
	});

	it("converts slash-separated models to stable keys", () => {
		expect(toOpenCodeModelKey("Qwen/Qwen2.5-14B-Instruct")).toBe(
			"Qwen%2FQwen2.5-14B-Instruct",
		);
	});

	it("supports model IDs with multiple slashes", () => {
		expect(toOpenCodeModelKey("org/sub/model")).toBe("org%2Fsub%2Fmodel");
	});

	it("escapes percent characters to avoid transport key collisions", () => {
		expect(toOpenCodeModelKey("foo%2Fbar")).toBe("foo%252Fbar");
	});

	it("throws for empty model names", () => {
		expect(() => toOpenCodeModelKey("")).toThrow(
			"OpenCode model must be non-empty",
		);
	});
});

describe("buildOpenCodeProviderSpec", () => {
	it("maps Ollama to a generated OpenAI-compatible OpenCode provider", () => {
		expect(
			buildOpenCodeProviderSpec({
				runtimeName: "ollama",
				runtimeBaseUrl: "http://localhost:11434",
				model: "Qwen/Qwen2.5-14B-Instruct",
			}),
		).toMatchObject({
			providerId: "ollama",
			npmPackage: "@ai-sdk/openai-compatible",
			baseURL: "http://localhost:11434/v1",
			runtimeModelName: "Qwen/Qwen2.5-14B-Instruct",
			transportModelKey: "Qwen%2FQwen2.5-14B-Instruct",
			modelArg: "ollama/Qwen%2FQwen2.5-14B-Instruct",
		});
	});
});
