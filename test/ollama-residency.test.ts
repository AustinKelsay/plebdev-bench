/**
 * Purpose: Unit tests for Ollama model residency enforcement.
 * Exports: none
 *
 * Invariants:
 * - Network calls are mocked.
 * - Tests cover `/api/ps` parsing, unload payloads, model equivalence, and timeout failures.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureOnlyOllamaModelLoaded,
	listRunningOllamaModels,
	unloadOllamaModel,
} from "../src/runtimes/ollama-residency.js";

const BASE_URL = "http://localhost:11434";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText: status === 200 ? "OK" : "Server Error",
	});
}

describe("ollama-residency", () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		mockFetch = vi.fn();
		globalThis.fetch = mockFetch as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("parses /api/ps and returns running model records", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				models: [
					{
						name: "qwen3.6:latest",
						size: 34_475_089_344,
					},
				],
			}),
		);

		const models = await listRunningOllamaModels({ baseUrl: BASE_URL });

		expect(models.map((model) => model.name)).toEqual(["qwen3.6:latest"]);
		expect(mockFetch).toHaveBeenCalledWith(
			`${BASE_URL}/api/ps`,
			expect.objectContaining({
				method: "GET",
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("sends an immediate empty-prompt unload request", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({ done: true, done_reason: "unload" }),
		);

		await unloadOllamaModel({
			baseUrl: BASE_URL,
			model: "gpt-oss:20b",
		});

		const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(mockFetch).toHaveBeenCalledWith(
			`${BASE_URL}/api/generate`,
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: expect.any(AbortSignal),
			}),
		);
		expect(JSON.parse(String(options.body))).toEqual({
			model: "gpt-oss:20b",
			prompt: "",
			stream: false,
			keep_alive: 0,
		});
	});

	it("unloads foreign models while preserving the allowed model", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					models: [{ name: "qwen3.6:latest" }, { name: "gpt-oss:20b" }],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({ done: true, done_reason: "unload" }),
			)
			.mockResolvedValueOnce(
				jsonResponse({ models: [{ name: "qwen3.6:latest" }] }),
			);

		const report = await ensureOnlyOllamaModelLoaded({
			baseUrl: BASE_URL,
			allowedModel: "qwen3.6:latest",
			pollIntervalMs: 0,
			settleTimeoutMs: 1_000,
		});

		expect(report).toEqual({
			allowedModel: "qwen3.6:latest",
			loadedModels: ["qwen3.6:latest"],
			unloadedModels: ["gpt-oss:20b"],
		});
		const unloadCall = mockFetch.mock.calls.find(
			([url]) => url === `${BASE_URL}/api/generate`,
		);
		expect(
			JSON.parse(String((unloadCall?.[1] as RequestInit).body)),
		).toMatchObject({
			model: "gpt-oss:20b",
			keep_alive: 0,
		});
	});

	it("treats bare model names and :latest names as equivalent", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({ models: [{ name: "qwen3.6:latest" }] }),
		);

		const report = await ensureOnlyOllamaModelLoaded({
			baseUrl: BASE_URL,
			allowedModel: "qwen3.6",
		});

		expect(report.loadedModels).toEqual(["qwen3.6:latest"]);
		expect(report.unloadedModels).toEqual([]);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("times out with the still-loaded foreign model names", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({ models: [{ name: "gpt-oss:20b" }] }),
			)
			.mockResolvedValueOnce(
				jsonResponse({ done: true, done_reason: "unload" }),
			);

		await expect(
			ensureOnlyOllamaModelLoaded({
				baseUrl: BASE_URL,
				allowedModel: "qwen3.6:latest",
				pollIntervalMs: 0,
				settleTimeoutMs: 0,
			}),
		).rejects.toThrow("allowed=qwen3.6:latest stillLoaded=gpt-oss:20b");
	});

	it("throws on non-OK HTTP responses", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response("not available", {
				status: 500,
				statusText: "Server Error",
			}),
		);

		await expect(
			listRunningOllamaModels({ baseUrl: BASE_URL }),
		).rejects.toThrow("Ollama residency request failed: 500 Server Error");
	});

	it("throws on invalid /api/ps schemas", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ models: [{ size: 123 }] }));

		await expect(
			listRunningOllamaModels({ baseUrl: BASE_URL }),
		).rejects.toThrow("Invalid response from");
	});
});
