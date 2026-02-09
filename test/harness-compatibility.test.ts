/**
 * Purpose: Unit tests for harness-runtime compatibility.
 * Exports: (none)
 *
 * Invariants:
 * - All harnesses in HARNESS_RUNTIME_COMPATIBILITY must include expected runtimes
 */

import { describe, it, expect } from "vitest";
import {
	isHarnessCompatibleWithRuntime,
	getCompatibleHarnesses,
	HARNESS_RUNTIME_COMPATIBILITY,
} from "../src/harnesses/harness.js";

describe("HARNESS_RUNTIME_COMPATIBILITY", () => {
	it("should define compatibility for all harnesses", () => {
		expect(HARNESS_RUNTIME_COMPATIBILITY.direct).toBeDefined();
		expect(HARNESS_RUNTIME_COMPATIBILITY.goose).toBeDefined();
		expect(HARNESS_RUNTIME_COMPATIBILITY.opencode).toBeDefined();
	});

	it("should have Ollama-compatible harnesses", () => {
		expect(HARNESS_RUNTIME_COMPATIBILITY.direct).toContain("ollama");
		expect(HARNESS_RUNTIME_COMPATIBILITY.goose).toContain("ollama");
		expect(HARNESS_RUNTIME_COMPATIBILITY.opencode).toContain("ollama");
	});

	it("should have vLLM-compatible harnesses", () => {
		expect(HARNESS_RUNTIME_COMPATIBILITY.direct).toContain("vllm");
		expect(HARNESS_RUNTIME_COMPATIBILITY.goose).toContain("vllm");
		expect(HARNESS_RUNTIME_COMPATIBILITY.opencode).toContain("vllm");
	});
});

describe("isHarnessCompatibleWithRuntime", () => {
	it("should return true for Ollama-compatible harnesses", () => {
		expect(isHarnessCompatibleWithRuntime("direct", "ollama")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("goose", "ollama")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("opencode", "ollama")).toBe(true);
	});

	it("should return true for vLLM with all harnesses", () => {
		expect(isHarnessCompatibleWithRuntime("direct", "vllm")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("goose", "vllm")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("opencode", "vllm")).toBe(true);
	});

	it("should return false for unknown runtimes", () => {
		expect(isHarnessCompatibleWithRuntime("direct", "unknown")).toBe(false);
	});
});

describe("getCompatibleHarnesses", () => {
	it("should return all harnesses for Ollama", () => {
		const harnesses = getCompatibleHarnesses("ollama");
		expect(harnesses).toContain("direct");
		expect(harnesses).toContain("goose");
		expect(harnesses).toContain("opencode");
		expect(harnesses.length).toBe(3);
	});

	it("should return all harnesses for vLLM", () => {
		const harnesses = getCompatibleHarnesses("vllm");
		expect(harnesses).toContain("direct");
		expect(harnesses).toContain("goose");
		expect(harnesses).toContain("opencode");
		expect(harnesses.length).toBe(3);
	});

	it("should return empty array for unknown runtimes", () => {
		const harnesses = getCompatibleHarnesses("unknown");
		expect(harnesses.length).toBe(0);
	});
});
