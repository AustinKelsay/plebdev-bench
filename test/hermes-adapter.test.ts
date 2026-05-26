/**
 * Purpose: Behavior tests for Hermes adapter code-output execution.
 * Exports: none
 *
 * Invariants:
 * - Hermes process execution is mocked.
 * - Code-output scoring trusts `solution.ts`, not stdout.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "../src/runtimes/index.js";

const execaMock = vi.hoisted(() => vi.fn());

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

describe("createHermesAdapter", () => {
	beforeEach(() => {
		execaMock.mockReset();
		vi.resetModules();
	});

	it("returns solution.ts as code-output Generated Output", async () => {
		const solution =
			"export function add(a: number, b: number) { return a + b; }";
		let generatedWorkspaceDir: string | undefined;
		execaMock.mockImplementation(
			async (
				command: string,
				args: string[],
				options: { cwd?: string; env?: NodeJS.ProcessEnv },
			) => {
				if (command === "hermes" && args.join(" ") === "chat --help") {
					return {
						stdout:
							"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
						stderr: "",
						exitCode: 0,
					};
				}
				if (command === "hermes") {
					const hermesHome = options.env?.HERMES_HOME;
					expect(hermesHome).toBeTruthy();
					await expect(
						fs.promises.readFile(
							path.join(String(hermesHome), "config.yaml"),
							"utf-8",
						),
					).resolves.toContain('base_url: "http://localhost:11434/v1"');
					generatedWorkspaceDir = options.cwd;
					await fs.promises.writeFile(
						path.join(String(options.cwd), "solution.ts"),
						solution,
						"utf-8",
					);
					return { stdout: "done", stderr: "", exitCode: 0 };
				}
				throw new Error(`Unexpected command: ${command}`);
			},
		);

		const { createHermesAdapter } = await import(
			"../src/harnesses/hermes-adapter.js"
		);
		const adapter = createHermesAdapter();
		const result = await adapter.generate({
			model: "qwen3.5:4b",
			prompt: "Write an add function.",
			timeoutMs: 5_000,
			runtime: createRuntime(),
		});

		expect(result.output).toBe(solution);
		expect(generatedWorkspaceDir).toMatch(
			process.platform === "darwin"
				? /^\/tmp\/plebdev-bench-hermes-/
				: /plebdev-bench-hermes-/,
		);
		expect(result.codeFilePath).toBeUndefined();
		await expect(
			fs.promises.access(String(generatedWorkspaceDir)),
		).rejects.toThrow();
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
		const runCall = execaMock.mock.calls.find(
			([command, args]) =>
				command === "hermes" && (args as string[]).join(" ") !== "chat --help",
		);
		const runArgs = runCall?.[1] as string[];
		expect(runArgs).toContain("file");
		const query = runArgs[runArgs.indexOf("--query") + 1];
		expect(query).toContain("Use the write_file tool to create solution.ts");
		expect(query).toContain("Do not print a textual write_file(...) call");
		expect(query).toContain("Write an add function.");
	});

	it("fails clearly when code-output does not produce solution.ts", async () => {
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-hermes-missing-"),
		);
		execaMock.mockImplementation(async (command: string, args: string[]) => {
			if (command === "hermes" && args.join(" ") === "chat --help") {
				return {
					stdout:
						"--query --model --provider --toolsets --quiet --yolo --accept-hooks",
					stderr: "",
					exitCode: 0,
				};
			}
			if (command === "hermes") {
				return { stdout: "I finished.", stderr: "", exitCode: 0 };
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const { createHermesAdapter } = await import(
				"../src/harnesses/hermes-adapter.js"
			);
			const adapter = createHermesAdapter();

			await expect(
				adapter.generate({
					model: "qwen3.5:4b",
					prompt: "Write an add function.",
					timeoutMs: 5_000,
					runtime: createRuntime(),
					workingDirectory: workspaceDir,
				}),
			).rejects.toMatchObject({
				message: expect.stringContaining("solution.ts"),
				failureType: "harness_error",
				output: "stdout:\nI finished.",
			});
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("runs workspace mode from the caller-supplied Benchmark Workspace", async () => {
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-hermes-workspace-"),
		);
		await fs.promises.mkdir(path.join(workspaceDir, "notes"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(workspaceDir, "notes", "context.txt"),
			"queued\n",
			"utf-8",
		);
		const targetPath = path.join(workspaceDir, "reports", "summary.txt");
		execaMock.mockImplementation(
			async (command: string, args: string[], options: { cwd?: string }) => {
				if (command === "hermes" && args.join(" ") === "chat --help") {
					return {
						stdout:
							"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
						stderr: "",
						exitCode: 0,
					};
				}
				if (command === "hermes") {
					expect(options.cwd).not.toBe(workspaceDir);
					expect(options.cwd).toMatch(
						process.platform === "darwin"
							? /^\/tmp\/plebdev-bench-hermes-workspace-/
							: /plebdev-bench-hermes-workspace-/,
					);
					await expect(
						fs.promises.readFile(
							path.join(String(options.cwd), "notes", "context.txt"),
							"utf-8",
						),
					).resolves.toBe("queued\n");
					await fs.promises.mkdir(path.join(String(options.cwd), "reports"), {
						recursive: true,
					});
					await fs.promises.writeFile(
						path.join(String(options.cwd), "reports", "summary.txt"),
						"ready\n",
						"utf-8",
					);
					await fs.promises.rm(
						path.join(String(options.cwd), "notes", "context.txt"),
						{
							force: true,
						},
					);
					return { stdout: "workspace complete", stderr: "", exitCode: 0 };
				}
				throw new Error(`Unexpected command: ${command}`);
			},
		);

		try {
			const { createHermesAdapter } = await import(
				"../src/harnesses/hermes-adapter.js"
			);
			const adapter = createHermesAdapter();
			const result = await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Create reports/summary.txt.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			expect(await fs.promises.readFile(targetPath, "utf-8")).toBe("ready\n");
			await expect(
				fs.promises.access(path.join(workspaceDir, "notes", "context.txt")),
			).rejects.toThrow();
			expect(result.output).toBe("workspace complete");
			expect(result.codeFilePath).toBeUndefined();
			const runCall = execaMock.mock.calls.find(
				([command, args]) =>
					command === "hermes" &&
					(args as string[]).join(" ") !== "chat --help",
			);
			const runArgs = runCall?.[1] as string[];
			expect(runArgs).toContain("--query");
			const query = runArgs[runArgs.indexOf("--query") + 1];
			expect(query).toContain("Use actual file tools in the current directory");
			expect(query).toContain("Do not print tool-call syntax");
			expect(query).not.toContain("write_file{");
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("rejects workspace pseudo tool-call output as a harness failure", async () => {
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-hermes-workspace-pseudo-"),
		);
		const leakedPath = path.join(workspaceDir, "reports", "status.txt");
		execaMock.mockImplementation(
			async (command: string, args: string[], options: { cwd?: string }) => {
				if (command === "hermes" && args.join(" ") === "chat --help") {
					return {
						stdout:
							"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
						stderr: "",
						exitCode: 0,
					};
				}
				if (command === "hermes") {
					await fs.promises.mkdir(path.join(String(options.cwd), "reports"), {
						recursive: true,
					});
					await fs.promises.writeFile(
						path.join(String(options.cwd), "reports", "status.txt"),
						"leaked\n",
						"utf-8",
					);
					return {
						stdout:
							"read_file(path='notes/context.txt')\nwrite_file(path='reports/status.txt', content='ready')\nDONE",
						stderr: "session_id: pseudo",
						exitCode: 0,
					};
				}
				throw new Error(`Unexpected command: ${command}`);
			},
		);

		try {
			const { createHermesAdapter } = await import(
				"../src/harnesses/hermes-adapter.js"
			);
			const adapter = createHermesAdapter();

			await expect(
				adapter.generate({
					model: "qwen3.5:4b",
					prompt: "Create reports/status.txt.",
					timeoutMs: 5_000,
					runtime: createRuntime(),
					promptMode: "workspace",
					workingDirectory: workspaceDir,
				}),
			).rejects.toMatchObject({
				message: expect.stringContaining("textual tool-call syntax"),
				failureType: "harness_error",
				output: expect.stringContaining("write_file"),
			});
			await expect(fs.promises.access(leakedPath)).rejects.toThrow();
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	it("uses configured Hermes turn limits for initial and retry attempts", async () => {
		const workspaceDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "plebdev-hermes-turns-"),
		);
		execaMock.mockImplementation(async (command: string, args: string[]) => {
			if (command === "hermes" && args.join(" ") === "chat --help") {
				return {
					stdout:
						"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
					stderr: "",
					exitCode: 0,
				};
			}
			if (command === "hermes") {
				await fs.promises.writeFile(
					path.join(workspaceDir, "solution.ts"),
					"export const value = 1;\n",
					"utf-8",
				);
				return { stdout: "done", stderr: "", exitCode: 0 };
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		try {
			const { createHermesAdapter } = await import(
				"../src/harnesses/hermes-adapter.js"
			);
			const adapter = createHermesAdapter({
				maxTurns: 2,
				retryMaxTurns: 4,
				workspaceMaxTurns: 6,
				workspaceRetryMaxTurns: 9,
			});

			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Write a value export.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				workingDirectory: workspaceDir,
			});
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Write a value export.\n[PLEBDEV_BENCH_CODE_ONLY_RETRY_ONCE]",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				workingDirectory: workspaceDir,
			});
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Update the workspace.",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});
			await adapter.generate({
				model: "qwen3.5:4b",
				prompt: "Update the workspace.\n[PLEBDEV_BENCH_CODE_ONLY_RETRY_ONCE]",
				timeoutMs: 5_000,
				runtime: createRuntime(),
				promptMode: "workspace",
				workingDirectory: workspaceDir,
			});

			const runCalls = execaMock.mock.calls.filter(
				([command, args]) =>
					command === "hermes" &&
					(args as string[]).join(" ") !== "chat --help",
			);
			const maxTurns = runCalls.map(([, args]) => {
				const argv = args as string[];
				return argv[argv.indexOf("--max-turns") + 1];
			});
			expect(maxTurns).toEqual(["2", "4", "6", "9"]);
		} finally {
			await fs.promises.rm(workspaceDir, { recursive: true, force: true });
		}
	});
});
