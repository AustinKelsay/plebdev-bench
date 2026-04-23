/**
 * Purpose: Regression tests for OpenCode adapter direct-run orchestration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateOpts } from "../src/harnesses/index.js";
import type { Runtime } from "../src/runtimes/index.js";

const execaMock = vi.fn();

vi.mock("execa", () => ({
	execa: execaMock,
}));

interface MockOpenCodeOptions {
	cwd: string;
	env: Record<string, string>;
}

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

/**
 * Creates an execa-like process for adapter tests.
 *
 * @param stdoutText - Text written to stdout before exit
 * @param stderrText - Text written to stderr before exit
 * @param exitCode - Process exit code, or null when unavailable
 * @returns Promise-like process object with stream handles
 */
function createProcess(
	stdoutText: string,
	stderrText = "",
	exitCode: number | null = 0,
): Promise<{ exitCode: number | null }> & {
	pid: number;
	stdout: PassThrough;
	stderr: PassThrough;
} {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const promise = Promise.resolve().then(() => {
		if (stdoutText.length > 0) stdout.write(stdoutText);
		if (stderrText.length > 0) stderr.write(stderrText);
		stdout.end();
		stderr.end();
		return { exitCode };
	}) as Promise<{ exitCode: number | null }> & {
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

	it("preserves caller-provided workspaces in workspace mode", async () => {
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
			if (command === "opencode") return createProcess("DONE");
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const adapter = createOpenCodeAdapter();
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			await expect(fs.promises.readFile(baselinePath, "utf-8")).resolves.toBe(
				'{"seed":"hash"}',
			);
			expect(execaMock.mock.calls.some(([command]) => command === "git")).toBe(
				false,
			);
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("rejects workspace mode without a caller-supplied working directory", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		const adapter = createOpenCodeAdapter();

		await expect(
			adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
			} as unknown as GenerateOpts),
		).rejects.toThrow(
			"OpenCode workspace mode requires a caller-supplied workingDirectory",
		);
	});

	it("marks permission auto-rejections as tainted workspace output", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-opencode-permission-"),
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess(
					"DONE",
					"! permission requested: external_directory (/tmp/foo/*); auto-rejecting\n",
				);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const adapter = createOpenCodeAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["tool_permission_denied"],
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("runs workspace mode from the canonical workspace path", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		const realWorkspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-opencode-real-"),
		);
		const linkParentDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-opencode-link-"),
		);
		const linkWorkspaceDir = path.join(linkParentDir, "workspace");
		await fs.promises.symlink(realWorkspaceDir, linkWorkspaceDir, "dir");
		const canonicalWorkspaceDir = await fs.promises.realpath(linkWorkspaceDir);

		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") return createProcess("DONE");
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const adapter = createOpenCodeAdapter();
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: linkWorkspaceDir,
			});

			const opencodeCall = execaMock.mock.calls.find(
				([command]) => command === "opencode",
			);
			expect(opencodeCall).toBeDefined();
			const [, args, options] = opencodeCall as [
				string,
				string[],
				MockOpenCodeOptions,
			];
			const config = JSON.parse(options.env.OPENCODE_CONFIG_CONTENT);

			expect(options.cwd).toBe(canonicalWorkspaceDir);
			expect(args[0]).toBe("run");
			expect(args[args.indexOf("--dir") + 1]).toBe(canonicalWorkspaceDir);
			expect(args[1]).not.toContain(canonicalWorkspaceDir);
			expect(config.permission.external_directory).toBe("deny");
			expect(config.enabled_providers).toEqual(["ollama"]);
		} finally {
			await fs.promises.rm(linkParentDir, { recursive: true, force: true });
			await fs.promises.rm(realWorkspaceDir, {
				recursive: true,
				force: true,
			});
		}
	});

	it("marks protocol-only workspace transcripts as tainted and normalizes output to empty", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-opencode-transcript-"),
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess(
					[
						JSON.stringify({ type: "step_start", sessionID: "abc" }),
						JSON.stringify({ type: "step_finish", sessionID: "abc" }),
					].join("\n"),
				);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const adapter = createOpenCodeAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Touch one file and reply DONE.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			expect(result.output).toBe("");
			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["internal_tool_transcript"],
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("prefers solution.ts in code-output mode", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation(
			(command: string, _args: string[], options: MockOpenCodeOptions) => {
				if (command === "opencode") {
					fs.writeFileSync(
						path.join(options.cwd, "solution.ts"),
						"export function add(a: number, b: number): number { return a + b; }\n",
					);
					return createProcess("DONE");
				}
				throw new Error(`Unexpected command: ${command}`);
			},
		);

		const adapter = createOpenCodeAdapter();
		const result = await adapter.generate({
			model: "qwen3.5:4b",
			prompt: "Return an add function.",
			timeoutMs: 5_000,
			runtime: createRuntime(),
		});

		try {
			expect(result.codeFilePath).toMatch(/solution\.ts$/);
			await expect(
				fs.promises.readFile(result.codeFilePath ?? "", "utf-8"),
			).resolves.toContain("export function add");
		} finally {
			if (result.codeFilePath) {
				await fs.promises.rm(path.dirname(result.codeFilePath), {
					recursive: true,
					force: true,
				});
			}
		}
	});

	it("salvages assistant code output when solution.ts is absent", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess(
					"export function add(a: number, b: number): number { return a + b; }",
				);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		const adapter = createOpenCodeAdapter();
		const result = await adapter.generate({
			model: "qwen3.5:4b",
			prompt: "Return an add function.",
			timeoutMs: 5_000,
			runtime: createRuntime(),
		});

		try {
			expect(result.codeFilePath).toMatch(/solution\.ts$/);
			expect(result.signalAssessment).toEqual({
				classification: "tainted",
				reasons: ["output_contract_violation"],
			});
		} finally {
			if (result.codeFilePath) {
				await fs.promises.rm(path.dirname(result.codeFilePath), {
					recursive: true,
					force: true,
				});
			}
		}
	});

	it("throws structured evidence for non-zero OpenCode exits", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess("partial stdout", "provider failed", 2);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		const adapter = createOpenCodeAdapter();
		let caught: unknown;
		try {
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return an add function.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("OpenCode exited with code 2");
		expect(caught).toMatchObject({
			output: "partial stdout",
			durationMs: expect.any(Number),
		});
	});

	it("throws structured evidence when OpenCode exits without an exit code", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess("partial stdout", "terminated", null);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		const adapter = createOpenCodeAdapter();
		let caught: unknown;
		try {
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return an add function.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain(
			"process terminated by signal or timed out",
		);
		expect(caught).toMatchObject({
			output: "partial stdout",
			durationMs: expect.any(Number),
		});
	});

	it("preserves execa output and timing when OpenCode execution rejects", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation((command: string) => {
			if (command !== "opencode") {
				throw new Error(`Unexpected command: ${command}`);
			}
			const stdout = new PassThrough();
			const stderr = new PassThrough();
			const processError = Object.assign(new Error("provider crashed"), {
				stdout: "partial stdout",
				stderr: "provider failed",
				output: ["partial stdout", "provider failed"],
				durationMs: 456,
			});
			const proc = Promise.reject(processError) as Promise<never> & {
				pid: number;
				stdout: PassThrough;
				stderr: PassThrough;
			};
			Object.assign(proc, { pid: 123, stdout, stderr });
			return proc;
		});

		const adapter = createOpenCodeAdapter();
		await expect(
			adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return an add function.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
			}),
		).rejects.toMatchObject({
			message: "provider crashed",
			output: "partial stdout\nprovider failed",
			stdout: "partial stdout",
			stderr: "provider failed",
			durationMs: 456,
		});
	});

	it("retries protocol-only code-output once, then throws with taint evidence", async () => {
		const { createOpenCodeAdapter } = await import(
			"../src/harnesses/opencode-adapter.js"
		);
		execaMock.mockImplementation((command: string) => {
			if (command === "opencode") {
				return createProcess(
					[
						JSON.stringify({ type: "step_start", sessionID: "abc" }),
						JSON.stringify({ type: "step_finish", sessionID: "abc" }),
					].join("\n"),
				);
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		const adapter = createOpenCodeAdapter();
		let caught: unknown;
		try {
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Return only final TypeScript source.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("did not write solution.ts");
		expect(caught).toMatchObject({
			signalAssessment: {
				classification: "tainted",
				reasons: ["internal_tool_transcript"],
			},
		});
		expect(
			execaMock.mock.calls.filter(([command]) => command === "opencode"),
		).toHaveLength(2);
	});
});
