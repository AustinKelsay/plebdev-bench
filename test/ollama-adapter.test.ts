/**
 * Purpose: Unit tests for Ollama runtime and Direct adapter with mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirectAdapter } from "../src/harnesses/direct-adapter.js";
import { createOllamaRuntime } from "../src/runtimes/ollama-runtime.js";
import type { Runtime } from "../src/runtimes/runtime.js";

describe("OllamaRuntime", () => {
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

			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			const result = await runtime.ping();

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				`${baseUrl}/api/version`,
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
		});

		it("should return false when Ollama is not reachable", async () => {
			mockFetch.mockRejectedValue(new Error("Connection refused"));

			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			const result = await runtime.ping();

			expect(result).toBe(false);
		});

		it("should return false on non-OK response", async () => {
			mockFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			const result = await runtime.ping();

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

			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			const models = await runtime.listModels();

			expect(models).toHaveLength(2);
			expect(models[0]).toBe("llama3.2:3b");
			expect(models[1]).toBe("deepseek-r1:latest");
		});

		it("should throw on error response", async () => {
			mockFetch.mockResolvedValue(
				new Response("Server Error", { status: 500 }),
			);

			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});

			await expect(runtime.listModels()).rejects.toThrow(
				"Failed to list models",
			);
		});
	});

	describe("runtime interface", () => {
		it("should have correct name and baseUrl", () => {
			const runtime = createOllamaRuntime({
				baseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			expect(runtime.name).toBe("ollama");
			expect(runtime.baseUrl).toBe(baseUrl);
		});
	});
});

describe("DirectAdapter", () => {
	const baseUrl = "http://localhost:11434";
	const timeoutMs = 5000;

	let mockFetch: ReturnType<typeof vi.fn>;
	let originalFetch: typeof fetch;
	let mockRuntime: Runtime;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		mockFetch = vi.fn();
		// Cast to unknown first to avoid Bun-specific fetch type issues
		globalThis.fetch = mockFetch as unknown as typeof fetch;

		// Create a mock runtime
		mockRuntime = {
			name: "ollama",
			baseUrl,
			apiFormat: "ollama",
			ping: vi.fn().mockResolvedValue(true),
			listModels: vi.fn().mockResolvedValue(["llama3.2:3b"]),
			getModelInfo: vi.fn().mockResolvedValue({
				name: "llama3.2:3b",
				sizeBytes: 2000000000,
				parametersBillions: 3,
			}),
		};
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("ping", () => {
		it("should always return true (availability depends on runtime)", async () => {
			const adapter = createDirectAdapter();
			const result = await adapter.ping();
			expect(result).toBe(true);
		});
	});

	describe("generate", () => {
		it("should generate completion using runtime baseUrl", async () => {
			// Ollama uses NDJSON streaming format - multiple JSON lines
			const mockNdjson = [
				{ response: "function add(", done: false },
				{ response: "a: number, b: number", done: false },
				{ response: "): number { return a + b; }", done: false },
				{ response: "", done: true, prompt_eval_count: 50, eval_count: 25 },
			]
				.map((obj) => JSON.stringify(obj))
				.join("\n");

			mockFetch.mockResolvedValue(new Response(mockNdjson, { status: 200 }));

			const adapter = createDirectAdapter();
			const result = await adapter.generate({
				model: "llama3.2:3b",
				prompt: "Write an add function",
				timeoutMs,
				runtime: mockRuntime,
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

			const adapter = createDirectAdapter();

			await expect(
				adapter.generate({
					model: "nonexistent-model",
					prompt: "test",
					timeoutMs,
					runtime: mockRuntime,
				}),
			).rejects.toThrow("Ollama generation failed");
		});
	});

	describe("harness interface", () => {
		it("should have correct name", () => {
			const adapter = createDirectAdapter();
			expect(adapter.name).toBe("direct");
		});
	});
});
