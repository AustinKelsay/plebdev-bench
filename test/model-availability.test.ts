/**
 * Purpose: Regression tests for model-availability diagnostics.
 * Exports: none
 *
 * Invariants:
 * - Diagnostic model probes report failures without masking caller errors.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("../src/runtimes/index.js", () => ({
	createRuntime: createRuntimeMock,
}));

import { listAvailableModelsByRuntime } from "../src/runner/model-availability.js";

describe("listAvailableModelsByRuntime", () => {
	beforeEach(() => {
		createRuntimeMock.mockReset();
	});

	it("records runtime probe failures without throwing", async () => {
		createRuntimeMock.mockReturnValueOnce({
			listModels: vi.fn().mockRejectedValueOnce(new Error("connection down")),
		});

		await expect(
			listAvailableModelsByRuntime(["ollama"], {
				ollamaBaseUrl: "http://localhost:11434",
				generateTimeoutMs: 300_000,
			} as Parameters<typeof listAvailableModelsByRuntime>[1]),
		).resolves.toEqual(["ollama: probe failed (connection down)"]);
	});
});
