/**
 * Purpose: Regression tests for Goose workspace turn budgeting.
 * Exports: createGooseAdapter test suite
 *
 * Invariants:
 * - Runtime fixtures are deterministic and side-effect free.
 * - Temp workspaces are removed after each test.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "../src/runtimes/index.js";

const execaMock = vi.fn();

vi.mock("execa", () => ({
	execa: execaMock,
}));

function createRuntime(): Runtime {
	return {
		name: "ollama",
		baseUrl: "http://localhost:11434",
		apiFormat: "ollama",
		ping: async () => true,
		listModels: async () => ["qwen3.5:4b"],
		getModelInfo: async () => ({
			name: "qwen3.5:4b",
			sizeBytes: 0,
			parametersBillions: 4,
		}),
	};
}

describe("createGooseAdapter", () => {
	beforeEach(() => {
		execaMock.mockReset();
	});

	it("uses workspace-specific max turns for workspace-scored attempts", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-workspace-"),
		);
		const runtime = createRuntime();

		execaMock.mockResolvedValue({
			exitCode: 0,
			stdout: "DONE",
			stderr: "",
		});

		try {
			const adapter = createGooseAdapter({
				maxTurns: 1,
				retryMaxTurns: 3,
				workspaceMaxTurns: 8,
				workspaceRetryMaxTurns: 12,
			});

			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime,
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			expect(execaMock).toHaveBeenCalledWith(
				"goose",
				expect.arrayContaining(["--max-turns", "8"]),
				expect.objectContaining({
					cwd: workspaceDir,
					env: expect.objectContaining({
						OLLAMA_HOST: "http://localhost:11434",
						GOOSE_MODEL: "qwen3.5:4b",
						GOOSE_PROVIDER: "ollama",
					}),
					input: expect.stringContaining("Workspace benchmark mode."),
				}),
			);
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("marks salvaged tool-call payloads as unexecuted when code was extracted instead of executed", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-tool-call-"),
		);
		const runtime = createRuntime();
		execaMock.mockResolvedValue({
			exitCode: 0,
			stdout: JSON.stringify({
				name: "text_editor",
				arguments: {
					file_text: "export function createValue(): number { return 42; }",
				},
			}),
			stderr: "",
		});

		try {
			const adapter = createGooseAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return TypeScript source only.",
				timeoutMs: 5_000,
				runtime,
				workingDirectory: workspaceDir,
			});

			expect(result.codeFilePath).toBeDefined();
			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["tool_call_not_executed"],
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("marks workspace continuation prompts as agent-requested input", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-workspace-prompt-"),
		);
		const runtime = createRuntime();
		execaMock.mockResolvedValue({
			exitCode: 0,
			stdout: JSON.stringify({
				messages: [
					{
						role: "assistant",
						content: [
							{
								text: "Would you like me to continue? I reached the maximum number of actions without user input.",
							},
						],
					},
				],
			}),
			stderr: "",
		});

		try {
			const adapter = createGooseAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime,
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			expect(result.output).toContain("Would you like me to continue?");
			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["agent_requested_input"],
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("detects taint that appears only on stderr when stdout also exists", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-stderr-taint-"),
		);
		const runtime = createRuntime();
		execaMock.mockResolvedValue({
			exitCode: 0,
			stdout: "export function add(a: number, b: number) { return a + b; }",
			stderr:
				"Would you like me to continue? I reached the maximum number of actions without user input.",
		});

		try {
			const adapter = createGooseAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return TypeScript source only.",
				timeoutMs: 5_000,
				runtime,
				workingDirectory: workspaceDir,
			});

			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["agent_requested_input"],
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("preserves stdout and stderr when Goose exits with an error", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-error-"),
		);
		const runtime = createRuntime();
		execaMock.mockRejectedValueOnce(
			Object.assign(new Error("goose failed"), {
				stdout: '{"sessionID":"abc","type":"step_start"}',
				stderr:
					"Would you like me to continue? I reached the maximum number of actions without user input.",
			}),
		);

		try {
			const adapter = createGooseAdapter();
			await expect(
				adapter.generate({
					model: "qwen3.5:4b",
					prompt: "Touch one file and reply DONE.",
					timeoutMs: 5_000,
					runtime,
					promptMode: "workspace",
					workingDirectory: workspaceDir,
				}),
			).rejects.toMatchObject({
				message: expect.stringContaining('"sessionID":"abc"'),
				output: expect.stringContaining("Would you like me to continue?"),
				signalAssessment: {
					classification: "tainted",
					reasons: ["internal_tool_transcript", "agent_requested_input"],
				},
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("preserves stdout and stderr when Goose times out with process output", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-timeout-output-"),
		);
		const runtime = createRuntime();
		execaMock.mockRejectedValueOnce(
			Object.assign(new Error("Command timed out"), {
				stdout: '{"sessionID":"abc","type":"step_start"}',
				stderr:
					"Would you like me to continue? I reached the maximum number of actions without user input.",
				timedOut: true,
			}),
		);

		try {
			const adapter = createGooseAdapter();
			await expect(
				adapter.generate({
					model: "qwen3.5:4b",
					prompt: "Touch one file and reply DONE.",
					timeoutMs: 5_000,
					runtime,
					promptMode: "workspace",
					workingDirectory: workspaceDir,
				}),
			).rejects.toMatchObject({
				message: expect.stringContaining("Goose timed out after 5s"),
				output: expect.stringContaining("Would you like me to continue?"),
				signalAssessment: {
					classification: "tainted",
					reasons: ["internal_tool_transcript", "agent_requested_input"],
				},
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("falls back to the execa message when stdout and stderr are empty", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-empty-error-"),
		);
		const runtime = createRuntime();
		execaMock.mockRejectedValueOnce(
			Object.assign(new Error("goose failed without streams"), {
				stdout: "",
				stderr: "",
			}),
		);

		try {
			const adapter = createGooseAdapter();
			await expect(
				adapter.generate({
					model: "qwen3.5:4b",
					prompt: "Touch one file and reply DONE.",
					timeoutMs: 5_000,
					runtime,
					promptMode: "workspace",
					workingDirectory: workspaceDir,
				}),
			).rejects.toMatchObject({
				message: "Goose failed: goose failed without streams",
				output: "goose failed without streams",
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
