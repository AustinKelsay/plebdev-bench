/**
 * Purpose: Verify executeItem preserves harness-provided failure metadata.
 * Exports: none
 *
 * Invariants:
 * - Generation failure metadata survives both inner and outer execution catches
 * - Signal assessments from harness/runtime failures are preserved for final rows
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeItem } from "../src/runner/item-executor.js";
import type { MatrixItem } from "../src/schemas/index.js";

interface TestMocks {
	createHarness: ReturnType<typeof vi.fn>;
	createRuntime: ReturnType<typeof vi.fn>;
	evaluateWithFrontier: ReturnType<typeof vi.fn>;
	getOpenRouterKey: ReturnType<typeof vi.fn>;
	loadPrompt: ReturnType<typeof vi.fn>;
	loadRubric: ReturnType<typeof vi.fn>;
	loggerChild: {
		debug: ReturnType<typeof vi.fn>;
		info: ReturnType<typeof vi.fn>;
		warn: ReturnType<typeof vi.fn>;
	};
	loggerFactory: ReturnType<typeof vi.fn>;
	prepareTestWorkspace: ReturnType<typeof vi.fn>;
	runGenerationWithInfraRetry: ReturnType<typeof vi.fn>;
	runScoringWithCompileRetry: ReturnType<typeof vi.fn>;
}

function createMocks(): TestMocks {
	return {
		createHarness: vi.fn(),
		createRuntime: vi.fn(),
		evaluateWithFrontier: vi.fn(),
		getOpenRouterKey: vi.fn(),
		loadPrompt: vi.fn(),
		loadRubric: vi.fn(),
		loggerChild: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
		},
		loggerFactory: vi.fn(),
		prepareTestWorkspace: vi.fn(),
		runGenerationWithInfraRetry: vi.fn(),
		runScoringWithCompileRetry: vi.fn(),
	};
}

const RUNTIME_CONFIG = {
	ollamaBaseUrl: "http://localhost:11434",
	gooseMaxTurns: 1,
	gooseRetryMaxTurns: 3,
	gooseWorkspaceMaxTurns: 8,
	gooseWorkspaceRetryMaxTurns: 12,
} as const;

const CODE_OUTPUT_ITEM = {
	id: "01",
	runtime: "ollama",
	model: "qwen3.5:4b",
	harness: "goose",
	test: "smoke",
	category: "coding",
	scoringMode: "code-module",
	requiresTools: false,
	requiredHarnessCapabilities: [],
	tags: [],
	timeoutMultiplier: 1,
	passType: "blind",
} satisfies MatrixItem;

const WORKSPACE_ITEM = {
	...CODE_OUTPUT_ITEM,
	id: "02",
	test: "workspace-smoke",
	category: "computer-use",
	scoringMode: "workspace",
	requiresTools: true,
	requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
} satisfies MatrixItem;

let mocks: TestMocks;

vi.mock("../src/harnesses/index.js", () => ({
	createHarness: (...args: unknown[]) => mocks.createHarness(...args),
}));

vi.mock("../src/runtimes/index.js", () => ({
	createRuntime: (...args: unknown[]) => mocks.createRuntime(...args),
}));

vi.mock("../src/lib/logger.js", () => ({
	logger: {
		child: (...args: unknown[]) => mocks.loggerFactory(...args),
	},
}));

vi.mock("../src/lib/openrouter-client.js", () => ({
	evaluateWithFrontier: (...args: unknown[]) =>
		mocks.evaluateWithFrontier(...args),
	getOpenRouterKey: (...args: unknown[]) => mocks.getOpenRouterKey(...args),
}));

vi.mock("../src/lib/scoring-spec.js", () => ({
	loadRubric: (...args: unknown[]) => mocks.loadRubric(...args),
}));

vi.mock("../src/lib/test-workspace.js", () => ({
	prepareTestWorkspace: (...args: unknown[]) =>
		mocks.prepareTestWorkspace(...args),
}));

vi.mock("../src/runner/generation-retry.js", () => ({
	runGenerationWithInfraRetry: (...args: unknown[]) =>
		mocks.runGenerationWithInfraRetry(...args),
}));

vi.mock("../src/runner/item-retry.js", () => ({
	loadPrompt: (...args: unknown[]) => mocks.loadPrompt(...args),
	runScoringWithCompileRetry: (...args: unknown[]) =>
		mocks.runScoringWithCompileRetry(...args),
}));

describe("executeItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks = createMocks();
		mocks.loggerFactory.mockReturnValue(mocks.loggerChild);
		mocks.createRuntime.mockReturnValue({ name: "ollama" });
		mocks.createHarness.mockReturnValue({ name: "goose" });
		mocks.loadPrompt.mockResolvedValue("complete the task");
		mocks.getOpenRouterKey.mockReturnValue(undefined);
		mocks.loadRubric.mockReturnValue(undefined);
		mocks.prepareTestWorkspace.mockResolvedValue({
			rootDir: "/tmp/workspace",
			cleanup: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("preserves harness metadata from generation failures handled in the inner catch", async () => {
		mocks.runGenerationWithInfraRetry.mockRejectedValueOnce(
			Object.assign(new Error("Harness surfaced transcript output"), {
				output: '{"sessionID":"abc","type":"step_start"}',
				durationMs: 321,
				failureType: "harness_error",
				signalAssessment: {
					classification: "tainted",
					reasons: ["internal_tool_transcript"],
				},
			}),
		);

		const result = await executeItem(CODE_OUTPUT_ITEM, RUNTIME_CONFIG, 5_000);

		expect(result.status).toBe("failed");
		expect(result.generation).toMatchObject({
			success: false,
			error: "Harness surfaced transcript output",
			failureType: "harness_error",
			durationMs: 321,
			output: '{"sessionID":"abc","type":"step_start"}',
		});
		expect(result.generationFailure).toEqual({
			type: "harness_error",
			message: "Harness surfaced transcript output",
		});
		expect(result.signalAssessment).toEqual({
			classification: "tainted",
			reasons: ["internal_tool_transcript"],
		});
	});

	it("normalizes negative generation failure durations to zero", async () => {
		mocks.runGenerationWithInfraRetry.mockRejectedValueOnce(
			Object.assign(new Error("Harness reported invalid duration"), {
				durationMs: -1,
				failureType: "harness_error",
			}),
		);

		const result = await executeItem(CODE_OUTPUT_ITEM, RUNTIME_CONFIG, 5_000);

		expect(result.status).toBe("failed");
		expect(result.generation).toMatchObject({
			success: false,
			error: "Harness reported invalid duration",
			failureType: "harness_error",
			durationMs: 0,
		});
	});

	it("drops malformed signal assessments from harness errors", async () => {
		mocks.runGenerationWithInfraRetry.mockRejectedValueOnce(
			Object.assign(new Error("Harness surfaced malformed taint payload"), {
				output: '{"sessionID":"abc","type":"step_start"}',
				durationMs: 321,
				failureType: "harness_error",
				signalAssessment: {
					classification: "tainted",
					reasons: [],
				},
			}),
		);

		const result = await executeItem(CODE_OUTPUT_ITEM, RUNTIME_CONFIG, 5_000);

		expect(result.status).toBe("failed");
		expect(result.signalAssessment).toEqual({
			classification: "tainted",
			reasons: ["internal_tool_transcript"],
		});
	});

	it("preserves harness taint after successful scoring", async () => {
		mocks.runGenerationWithInfraRetry.mockResolvedValueOnce({
			generation: {
				success: true,
				output: "DONE",
				durationMs: 123,
			},
			generationAttempts: 1,
			signalAssessment: {
				classification: "tainted",
				reasons: ["tool_permission_denied"],
			},
		});
		mocks.runScoringWithCompileRetry.mockResolvedValueOnce({
			scoringResult: {
				passed: 5,
				failed: 0,
				total: 5,
			},
			generation: {
				success: true,
				output: "DONE",
				durationMs: 123,
			},
			scoringOnlyDurationMs: 12,
			retryGenerationDurationMs: 0,
			compileRetryUsed: false,
			signalAssessment: {
				classification: "tainted",
				reasons: ["confirmation_without_artifact"],
			},
		});

		const result = await executeItem(WORKSPACE_ITEM, RUNTIME_CONFIG, 5_000);

		expect(result.status).toBe("completed");
		expect(result.signalAssessment).toEqual({
			classification: "tainted",
			reasons: ["tool_permission_denied", "confirmation_without_artifact"],
		});
	});

	it("preserves harness metadata from failures handled in the outer catch", async () => {
		mocks.prepareTestWorkspace.mockRejectedValueOnce(
			Object.assign(new Error("workspace bootstrap failed"), {
				output:
					"Would you like me to continue? I reached the maximum number of actions without user input.",
				durationMs: 77,
				failureType: "harness_error",
				signalAssessment: {
					classification: "tainted",
					reasons: ["agent_requested_input"],
				},
			}),
		);

		const result = await executeItem(WORKSPACE_ITEM, RUNTIME_CONFIG, 5_000);

		expect(result.status).toBe("failed");
		expect(result.generation).toMatchObject({
			success: false,
			error: "workspace bootstrap failed",
			failureType: "harness_error",
			durationMs: 77,
			output:
				"Would you like me to continue? I reached the maximum number of actions without user input.",
		});
		expect(result.generationFailure).toEqual({
			type: "harness_error",
			message: "workspace bootstrap failed",
		});
		expect(result.signalAssessment).toEqual({
			classification: "tainted",
			reasons: ["agent_requested_input"],
		});
	});
});
