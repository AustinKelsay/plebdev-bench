/**
 * Purpose: Verify generation retry behavior for transient harness failures.
 */

import { describe, expect, it, vi } from "vitest";
import { runGenerationWithInfraRetry } from "../src/runner/generation-retry.js";
import type { MatrixItem } from "../src/schemas/index.js";

describe("runGenerationWithInfraRetry", () => {
	it("retries a harness error once with a freshly seeded workspace", async () => {
		const firstWorkspace = {
			rootDir: "/tmp/workspace-a",
			cleanup: vi.fn().mockResolvedValue(undefined),
		};
		const secondWorkspace = {
			rootDir: "/tmp/workspace-b",
			cleanup: vi.fn().mockResolvedValue(undefined),
		};
		const prepareFreshWorkspace = vi
			.fn()
			.mockResolvedValueOnce(secondWorkspace);
		const generate = vi
			.fn()
			.mockRejectedValueOnce(
				new Error(
					"OpenCode hung (no output for 213s). Process may be stuck on backend.",
				),
			)
			.mockResolvedValueOnce({
				output: "DONE",
				durationMs: 250,
				codeFilePath: "/tmp/workspace-b/solution.ts",
			});

		const result = await runGenerationWithInfraRetry({
			item: {
				id: "01",
				runtime: "ollama",
				model: "qwen3.5:4b",
				harness: "opencode",
				test: "workspace-tool-smoke",
				category: "computer-use",
				scoringMode: "workspace",
				requiresTools: true,
				requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
				tags: ["workspace"],
				timeoutMultiplier: 1,
				passType: "blind",
			} satisfies MatrixItem,
			prompt: "do the task",
			timeoutMs: 300_000,
			unloadAfter: true,
			runtime: { name: "ollama" } as never,
			harness: { generate } as never,
			workspace: firstWorkspace,
			prepareFreshWorkspace,
			log: {
				info: vi.fn(),
				warn: vi.fn(),
			},
		});

		expect(generate).toHaveBeenCalledTimes(2);
		expect(generate.mock.calls[0][0].workingDirectory).toBe("/tmp/workspace-a");
		expect(generate.mock.calls[1][0].workingDirectory).toBe("/tmp/workspace-b");
		expect(prepareFreshWorkspace).toHaveBeenCalledTimes(1);
		expect(result.generationAttempts).toBe(2);
		expect(result.generation.success).toBe(true);
		expect(result.workspace?.rootDir).toBe("/tmp/workspace-b");
	});

	it("returns a structured harness error when fresh workspace preparation fails", async () => {
		const generate = vi
			.fn()
			.mockRejectedValueOnce(
				new Error(
					"OpenCode hung (no output for 213s). Process may be stuck on backend.",
				),
			);

		const result = await runGenerationWithInfraRetry({
			item: {
				id: "01",
				runtime: "ollama",
				model: "qwen3.5:4b",
				harness: "opencode",
				test: "workspace-tool-smoke",
				category: "computer-use",
				scoringMode: "workspace",
				requiresTools: true,
				requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
				tags: ["workspace"],
				timeoutMultiplier: 1,
				passType: "blind",
			} satisfies MatrixItem,
			prompt: "do the task",
			timeoutMs: 300_000,
			unloadAfter: true,
			runtime: { name: "ollama" } as never,
			harness: { generate } as never,
			workspace: {
				rootDir: "/tmp/workspace-a",
				cleanup: vi.fn().mockResolvedValue(undefined),
			},
			prepareFreshWorkspace: vi
				.fn()
				.mockRejectedValueOnce(new Error("mkdtemp failed")),
			log: {
				info: vi.fn(),
				warn: vi.fn(),
			},
		});

		expect(result.generation.success).toBe(false);
		expect(result.generation.failureType).toBe("harness_error");
		expect(result.generationFailure?.type).toBe("harness_error");
		expect(result.generation.error).toContain(
			"Failed to prepare fresh workspace for retry: mkdtemp failed",
		);
		expect(generate).toHaveBeenCalledTimes(1);
		expect(result.generationAttempts).toBe(1);
	});
});
