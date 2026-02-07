/**
 * Purpose: Unit tests for OpenCode model/base URL normalization.
 */

import { describe, expect, it } from "vitest";
import {
	toOpenAiCompatBaseUrl,
	toOpenCodeModelKey,
} from "../src/harnesses/opencode-model.js";

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
			"Qwen__Qwen2.5-14B-Instruct",
		);
	});

	it("throws for empty model names", () => {
		expect(() => toOpenCodeModelKey("")).toThrow(
			"OpenCode model must be non-empty",
		);
	});
});
