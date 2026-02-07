/**
 * Purpose: Unit tests for vLLM runtime functionality.
 */

import { describe, it, expect } from "bun:test";
import { estimateParametersFromName } from "../src/runtimes/vllm-runtime.js";

describe("estimateParametersFromName", () => {
	it("should parse 7b pattern", () => {
		expect(estimateParametersFromName("llama-7b")).toBe(7);
		expect(estimateParametersFromName("llama-7B")).toBe(7);
		expect(estimateParametersFromName("model-7b-instruct")).toBe(7);
	});

	it("should parse 70b pattern", () => {
		expect(estimateParametersFromName("llama-70b")).toBe(70);
		expect(estimateParametersFromName("llama-70B")).toBe(70);
	});

	it("should parse decimal patterns", () => {
		expect(estimateParametersFromName("qwen-1.5b")).toBe(1.5);
		expect(estimateParametersFromName("model-2.7B")).toBe(2.7);
	});

	it("should parse million patterns", () => {
		expect(estimateParametersFromName("model-350m")).toBe(0.35);
		expect(estimateParametersFromName("model-1300M")).toBe(1.3);
	});

	it("should return default 7 for unknown patterns", () => {
		expect(estimateParametersFromName("unknown-model")).toBe(7);
		expect(estimateParametersFromName("gpt-4")).toBe(7);
	});

	it("should handle real model names", () => {
		expect(estimateParametersFromName("Qwen/Qwen2.5-72B-Instruct")).toBe(72);
		expect(estimateParametersFromName("meta-llama/Llama-3.2-3B")).toBe(3);
		expect(estimateParametersFromName("mistralai/Mistral-7B-Instruct-v0.2")).toBe(7);
	});
});
