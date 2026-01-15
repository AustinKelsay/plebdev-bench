/**
 * Purpose: Test failure classification logic.
 */

import { describe, expect, it } from "vitest";
import { classifyGenerationError, classifyScoringError } from "../src/lib/failure-classifier.js";

describe("classifyGenerationError", () => {
	it("should classify timeout errors", () => {
		expect(classifyGenerationError("Request timed out after 60s")).toBe("timeout");
		expect(classifyGenerationError("Timeout waiting for response")).toBe("timeout");
		expect(classifyGenerationError("Connection timed out")).toBe("timeout");
	});

	it("should classify prompt not found errors", () => {
		expect(classifyGenerationError("Prompt file not found: /path/to/prompt.md")).toBe("prompt_not_found");
		expect(classifyGenerationError("Prompt not found for test")).toBe("prompt_not_found");
	});

	it("should classify API errors", () => {
		expect(classifyGenerationError("HTTP 500 Internal Server Error")).toBe("api_error");
		expect(classifyGenerationError("Failed: status 429")).toBe("api_error");
		expect(classifyGenerationError("Fetch failed: network error")).toBe("api_error");
		expect(classifyGenerationError("Connection refused")).toBe("api_error");
	});

	it("should classify harness errors", () => {
		expect(classifyGenerationError("Empty output received")).toBe("harness_error");
		expect(classifyGenerationError("Output too short (3 chars)")).toBe("harness_error");
		expect(classifyGenerationError("No output from model")).toBe("harness_error");
		expect(classifyGenerationError("Model not recognized")).toBe("harness_error");
		expect(classifyGenerationError("Command failed with exit code 1")).toBe("harness_error");
	});

	it("should return unknown for unrecognized errors", () => {
		expect(classifyGenerationError("Something unexpected happened")).toBe("unknown");
		expect(classifyGenerationError("Generic error")).toBe("unknown");
	});
});

describe("classifyScoringError", () => {
	it("should classify no_spec errors", () => {
		expect(classifyScoringError("No scoring spec found")).toBe("no_spec");
	});

	it("should classify extraction errors", () => {
		expect(classifyScoringError("Code extraction failed: no code blocks found")).toBe("extraction");
		expect(classifyScoringError("Code extraction failed: empty input")).toBe("extraction");
	});

	it("should classify spec_load errors", () => {
		expect(classifyScoringError("Failed to load scoring spec: syntax error")).toBe("spec_load");
	});

	it("should classify import errors", () => {
		expect(classifyScoringError("Import failed: SyntaxError: Unexpected token")).toBe("import");
		expect(classifyScoringError("Import failed: ReferenceError: x is not defined")).toBe("import");
	});

	it("should classify export_validation errors", () => {
		expect(classifyScoringError("Missing export: add")).toBe("export_validation");
		expect(classifyScoringError("Failed to create instance from \"createCalculator\"")).toBe("export_validation");
		expect(classifyScoringError("Function \"add\" not found or not a function")).toBe("export_validation");
	});

	it("should classify test_execution errors", () => {
		expect(classifyScoringError("Value mismatch")).toBe("test_execution");
	});

	it("should return unknown for unrecognized errors", () => {
		expect(classifyScoringError("Something went wrong")).toBe("unknown");
	});
});
