/**
 * Purpose: Regression tests for OpenCode adapter workspace handling.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "../src/runtimes/index.js";

const execaMock = vi.fn();

vi.mock("execa", () => ({
	execa: execaMock,
}));

function createSuccessfulProcess(stdoutText: string): Promise<{
	exitCode: number;
}> & {
	pid: number;
	stdout: PassThrough;
	stderr: PassThrough;
} {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const promise = Promise.resolve().then(() => {
		if (stdoutText.length > 0) {
			stdout.write(stdoutText);
		}
		stdout.end();
		stderr.end();
		return { exitCode: 0 };
	}) as Promise<{ exitCode: number }> & {
		pid: number;
		stdout: PassThrough;
		stderr: PassThrough;
	};

	promise.pid = 123;
	promise.stdout = stdout;
	promise.stderr = stderr;
	return promise;
}

describe("createOpenCodeAdapter", () => {
	beforeEach(() => {
		execaMock.mockReset();
	});

	it("preserves externally provided workspaces in workspace mode", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-opencode-workspace-"),
		);
		const baselinePath = path.join(
			workspaceDir,
			".plebdev-bench-baseline.json",
		);
		await fs.promises.writeFile(baselinePath, '{"seed":"hash"}');

		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createSuccessfulProcess("DONE");
			}
			throw new Error(`Unexpected command: ${command}`);
		});

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

		try {
			const adapter = createOpenCodeAdapter();
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime,
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			await expect(fs.promises.readFile(baselinePath, "utf-8")).resolves.toBe(
				'{"seed":"hash"}',
			);
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
