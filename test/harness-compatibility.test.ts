/**
 * Purpose: Unit tests for harness-runtime compatibility.
 * Exports: (none)
 *
 * Invariants:
 * - All harnesses in HARNESS_RUNTIME_COMPATIBILITY must include expected runtimes
 */

import { describe, expect, it } from "vitest";
import {
	HARNESS_CAPABILITY_MAP,
	HARNESS_RUNTIME_COMPATIBILITY,
	doesHarnessSupportCapabilities,
	getCompatibleHarnesses,
	getHarnessCapabilities,
	isHarnessCompatibleWithRuntime,
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

	it("should restrict harnesses to Ollama only", () => {
		expect(HARNESS_RUNTIME_COMPATIBILITY.direct).toEqual(["ollama"]);
		expect(HARNESS_RUNTIME_COMPATIBILITY.goose).toEqual(["ollama"]);
		expect(HARNESS_RUNTIME_COMPATIBILITY.opencode).toEqual(["ollama"]);
	});
});

describe("HARNESS_CAPABILITY_MAP", () => {
	it("declares conservative workspace capabilities per harness", () => {
		expect(HARNESS_CAPABILITY_MAP.direct).toEqual([]);
		expect(HARNESS_CAPABILITY_MAP.goose).toEqual([
			"workspace-read",
			"workspace-write",
		]);
		expect(HARNESS_CAPABILITY_MAP.opencode).toEqual([
			"workspace-read",
			"workspace-write",
			"workspace-mkdir",
			"workspace-search",
			"workspace-delete",
		]);
	});

	it("returns harness capabilities through the public helper", () => {
		expect(getHarnessCapabilities("opencode")).toContain("workspace-delete");
	});

	it("checks capability support exactly", () => {
		expect(
			doesHarnessSupportCapabilities("goose", [
				"workspace-read",
				"workspace-write",
			]),
		).toBe(true);
		expect(doesHarnessSupportCapabilities("goose", ["workspace-delete"])).toBe(
			false,
		);
		expect(
			doesHarnessSupportCapabilities("opencode", [
				"workspace-mkdir",
				"workspace-search",
				"workspace-delete",
			]),
		).toBe(true);
	});
});

describe("isHarnessCompatibleWithRuntime", () => {
	it("should return true for Ollama-compatible harnesses", () => {
		expect(isHarnessCompatibleWithRuntime("direct", "ollama")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("goose", "ollama")).toBe(true);
		expect(isHarnessCompatibleWithRuntime("opencode", "ollama")).toBe(true);
	});

	it("should return false for removed runtimes", () => {
		expect(isHarnessCompatibleWithRuntime("direct", "vllm")).toBe(false);
		expect(isHarnessCompatibleWithRuntime("goose", "vllm")).toBe(false);
		expect(isHarnessCompatibleWithRuntime("opencode", "vllm")).toBe(false);
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

	it("should return empty array for removed runtimes", () => {
		const harnesses = getCompatibleHarnesses("vllm");
		expect(harnesses.length).toBe(0);
	});

	it("should return empty array for unknown runtimes", () => {
		const harnesses = getCompatibleHarnesses("unknown");
		expect(harnesses.length).toBe(0);
	});
});
