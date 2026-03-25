/**
 * Purpose: Unit tests for signal assessment helpers and workspace taint finalization.
 */

import { describe, expect, it } from "vitest";
import {
	appendSignalAssessmentReasons,
	createTaintedSignalAssessment,
	finalizeItemSignalAssessment,
} from "../src/lib/signal-assessment.js";

describe("appendSignalAssessmentReasons", () => {
	it("returns a trustworthy assessment when no reasons are added", () => {
		expect(appendSignalAssessmentReasons(undefined, [])).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("deduplicates taint reasons", () => {
		expect(
			appendSignalAssessmentReasons(undefined, [
				"tool_permission_denied",
				"tool_permission_denied",
			]),
		).toEqual({
			classification: "tainted",
			reasons: ["tool_permission_denied"],
		});
	});
});

describe("createTaintedSignalAssessment", () => {
	it("rejects empty taint assessments", () => {
		expect(() => createTaintedSignalAssessment([])).toThrow(
			"createTaintedSignalAssessment called with empty reasons",
		);
	});
});

describe("finalizeItemSignalAssessment", () => {
	it("marks confirmation-only workspace failures as tainted", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			scoringMode: "workspace",
			automatedScore: { passed: 1, failed: 2, total: 3 },
			output: "DONE",
		});

		expect(assessment).toEqual({
			classification: "tainted",
			reasons: ["confirmation_without_artifact"],
		});
	});

	it("marks raw tool-call payload workspace failures as tainted", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			scoringMode: "workspace",
			automatedScore: { passed: 0, failed: 5, total: 5 },
			output: JSON.stringify({
				tool: "bash",
				arguments: { command: "mkdir reports && echo done" },
			}),
		});

		expect(assessment).toEqual({
			classification: "tainted",
			reasons: ["tool_call_not_executed"],
		});
	});

	it("preserves trustworthy output for successful workspace rows", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			scoringMode: "workspace",
			automatedScore: { passed: 5, failed: 0, total: 5 },
			output: "DONE",
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});
});
