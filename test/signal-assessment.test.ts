/**
 * Purpose: Unit tests for signal assessment helpers and workspace taint finalization.
 * Exports: none
 *
 * Invariants:
 * - Signal helper outputs stay deterministic for the same reason inputs
 * - Finalization preserves trustworthy vs tainted classification rules
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
			automatedScore: { passed: 5, failed: 0, total: 5 },
			output: "DONE",
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("marks transcript-only failed rows as tainted", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: undefined,
			rowFailed: true,
			output:
				'{"type":"step_start","sessionID":"abc"}\n{"type":"step_finish","sessionID":"abc"}',
		});

		expect(assessment).toEqual({
			classification: "tainted",
			reasons: ["internal_tool_transcript"],
		});
	});

	it("marks continuation prompts as tainted", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 0, failed: 5, total: 5 },
			output:
				"Would you like me to continue? I reached the maximum number of actions without user input.",
		});

		expect(assessment).toEqual({
			classification: "tainted",
			reasons: ["agent_requested_input"],
		});
	});

	it("does not taint failed rows for benign filePath object literals", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 0, failed: 1, total: 1 },
			output: 'const options = { filePath: "src/index.ts" };',
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("does not taint failed rows for benign write function calls", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 0, failed: 1, total: 1 },
			output: 'write("hello");',
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("does not taint failed rows for ordinary confirmation copy", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 0, failed: 1, total: 1 },
			output: "Please confirm your email address to continue.",
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("does not taint failed rows for generic autonomy prose", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 0, failed: 1, total: 1 },
			output: "The agent can operate without user input once scheduled.",
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("preserves trustworthy classification for ordinary semantic failures", () => {
		const assessment = finalizeItemSignalAssessment({
			existing: undefined,
			automatedScore: { passed: 3, failed: 2, total: 5 },
			output:
				"export function add(a: number, b: number): number { return a - b; }",
		});

		expect(assessment).toEqual({
			classification: "trustworthy",
			reasons: [],
		});
	});

	it("throws when neither rowFailed nor automatedScore is provided", () => {
		expect(() =>
			finalizeItemSignalAssessment({
				existing: undefined,
				automatedScore: undefined,
				output: undefined,
			}),
		).toThrow(
			"finalizeItemSignalAssessment requires rowFailed or automatedScore",
		);
	});
});
