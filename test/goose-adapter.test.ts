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
});
