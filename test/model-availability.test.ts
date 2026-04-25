/**
 * Purpose: Regression tests for model-availability diagnostics.
 * Exports: none
 *
 * Invariants:
 * - Diagnostic model probes report failures without masking caller errors.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/schemas/index.js";

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
		const configFixture = {
			...defaultConfig,
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 300_000,
		} satisfies Parameters<typeof listAvailableModelsByRuntime>[1];

		await expect(
			listAvailableModelsByRuntime(["ollama"], configFixture),
		).resolves.toEqual(["ollama: probe failed (connection down)"]);
	});

	it("records successful empty runtime probes", async () => {
		createRuntimeMock.mockReturnValueOnce({
			listModels: vi.fn().mockResolvedValueOnce([]),
		});
		const configFixture = {
			...defaultConfig,
			ollamaBaseUrl: "http://localhost:11434",
			generateTimeoutMs: 300_000,
		} satisfies Parameters<typeof listAvailableModelsByRuntime>[1];

		await expect(
			listAvailableModelsByRuntime(["ollama"], configFixture),
		).resolves.toEqual(["ollama: (no models installed)"]);
	});
});
