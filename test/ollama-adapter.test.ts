/**
 * Purpose: Unit tests for Ollama adapter with mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOllamaAdapter } from "../src/harnesses/ollama-adapter.js";

describe("OllamaAdapter", () => {
	const baseUrl = "http://localhost:11434";
	const timeoutMs = 5000;

	let mockFetch: ReturnType<typeof vi.fn>;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		mockFetch = vi.fn();
		// Cast to unknown first to avoid Bun-specific fetch type issues
		globalThis.fetch = mockFetch as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("ping", () => {
		it("should return true when Ollama is reachable", async () => {
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ version: "0.5.1" }), { status: 200 }),
			);

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			const result = await adapter.ping();

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				`${baseUrl}/api/version`,
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
		});

		it("should return false when Ollama is not reachable", async () => {
			mockFetch.mockRejectedValue(new Error("Connection refused"));

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			const result = await adapter.ping();

			expect(result).toBe(false);
		});

		it("should return false on non-OK response", async () => {
			mockFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			const result = await adapter.ping();

			expect(result).toBe(false);
		});
	});

	describe("listModels", () => {
		it("should return list of model names", async () => {
			const mockModels = {
				models: [
					{
						name: "llama3.2:3b",
						size: 2019393189,
						modified_at: "2025-05-04T17:37:44.706015396-07:00",
						digest: "a80c4f17acd5",
					},
					{
						name: "deepseek-r1:latest",
						size: 4683075271,
						modified_at: "2025-05-10T08:06:48.639712648-07:00",
						digest: "0a8c26691023",
					},
				],
			};

			mockFetch.mockResolvedValue(
				new Response(JSON.stringify(mockModels), { status: 200 }),
			);

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			const models = await adapter.listModels();

			expect(models).toHaveLength(2);
			expect(models[0]).toBe("llama3.2:3b");
			expect(models[1]).toBe("deepseek-r1:latest");
		});

		it("should throw on error response", async () => {
			mockFetch.mockResolvedValue(
				new Response("Server Error", { status: 500 }),
			);

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });

			await expect(adapter.listModels()).rejects.toThrow("Failed to list models");
		});
	});

	describe("generate", () => {
		it("should generate completion", async () => {
			const mockResponse = {
				model: "llama3.2:3b",
				response: "function add(a: number, b: number): number { return a + b; }",
				done: true,
				total_duration: 5000000000,
				prompt_eval_count: 50,
				eval_count: 25,
			};

			mockFetch.mockResolvedValue(
				new Response(JSON.stringify(mockResponse), { status: 200 }),
			);

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			const result = await adapter.generate({
				model: "llama3.2:3b",
				prompt: "Write an add function",
				timeoutMs,
			});

			expect(result.output).toContain("add");
			expect(result.promptTokens).toBe(50);
			expect(result.completionTokens).toBe(25);

				expect(mockFetch).toHaveBeenCalledWith(
					`${baseUrl}/api/generate`,
					expect.objectContaining({
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: expect.stringContaining('"stream":true'),
					}),
				);
			});

		it("should throw on generation error", async () => {
			mockFetch.mockResolvedValue(
				new Response("Model not found", { status: 404 }),
			);

			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });

			await expect(
				adapter.generate({
					model: "nonexistent-model",
					prompt: "test",
					timeoutMs,
				}),
			).rejects.toThrow("Generation failed");
		});
	});

	describe("harness interface", () => {
		it("should have correct name", () => {
			const adapter = createOllamaAdapter({ baseUrl, defaultTimeoutMs: timeoutMs });
			expect(adapter.name).toBe("ollama");
		});
	});
});
