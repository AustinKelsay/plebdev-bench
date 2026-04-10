/**
 * Purpose: Regression tests for Goose workspace turn budgeting.
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
		const runtime: Runtime = {
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
		const runtime: Runtime = {
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
		const runtime: Runtime = {
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

	it("preserves stdout and stderr when Goose exits with an error", async () => {
		const { createGooseAdapter } = await import(
			"../src/harnesses/goose-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-goose-error-"),
		);
		const runtime: Runtime = {
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
				output: expect.stringContaining(
					"Would you like me to continue?",
				),
				signalAssessment: {
					classification: "tainted",
					reasons: [
						"internal_tool_transcript",
						"agent_requested_input",
					],
				},
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
