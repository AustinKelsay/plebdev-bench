/**
 * Purpose: OpenAI-compatible HTTP client for /v1/chat/completions.
 * Exports: generateOpenAiCompat, OpenAiCompatGenerateOpts
 *
 * Handles SSE streaming from OpenAI-compatible endpoints (vLLM, llama.cpp, etc.).
 * Converts prompts to chat messages format.
 *
 * Invariants:
 * - All requests have a timeout via AbortController
 * - Throws descriptive errors on timeout
 */

import { z } from "zod";
import type { GenerateResponse } from "./ollama-client.js";
import { logger } from "./logger.js";

/** Options for OpenAI-compatible generation. */
export interface OpenAiCompatGenerateOpts {
	/** API base URL (e.g., "http://localhost:8000"). */
	baseUrl: string;
	/** Model name. */
	model: string;
	/** The prompt to send to the model (converted to user message). */
	prompt: string;
	/** Timeout in milliseconds. */
	timeoutMs: number;
	/** Optional API key for authenticated endpoints. */
	apiKey?: string;
}

const ChatCompletionChunkSchema = z
	.object({
		choices: z
			.array(
				z
					.object({
						delta: z
							.object({
								content: z.string().optional(),
							})
							.optional(),
					})
					.passthrough(),
			)
			.optional(),
		usage: z
			.object({
				prompt_tokens: z.number().int().nonnegative().optional(),
				completion_tokens: z.number().int().nonnegative().optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

/**
 * Generates text using an OpenAI-compatible /v1/chat/completions endpoint.
 *
 * Uses SSE streaming to handle responses from vLLM, llama.cpp, etc.
 * Converts the prompt to a single user message.
 *
 * @param opts - Generation options
 * @returns Generation response with output and optional token counts
 * @throws Error on timeout or HTTP failure
 */
export async function generateOpenAiCompat(opts: OpenAiCompatGenerateOpts): Promise<GenerateResponse> {
	const { baseUrl, model, prompt, timeoutMs, apiKey } = opts;
	const log = logger.child({ module: "openai-compat-client", model, baseUrl });

	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(
			`Invalid timeoutMs "${String(timeoutMs)}" for OpenAI-compatible generation. Must be a finite positive number.`,
		);
	}

	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		const response = await fetch(`${baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: prompt }],
				stream: true,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			throw new Error(
				`OpenAI-compatible generation failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}`,
			);
		}

		// Accumulate streamed response
		let output = "";
		let promptTokens: number | undefined;
		let completionTokens: number | undefined;

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body from OpenAI-compatible API");

		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Parse SSE format: lines starting with "data: "
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith("data: ")) continue;

				const data = trimmed.slice(6); // Remove "data: " prefix
				if (data === "[DONE]") continue;

				try {
					const parsed = JSON.parse(data) as unknown;
					const result = ChatCompletionChunkSchema.safeParse(parsed);
					if (!result.success) {
						log.debug(
							{ issues: result.error.issues },
							"Skipping SSE chunk that failed schema validation",
						);
						continue;
					}

					const chunk = result.data;
					const delta = chunk.choices?.[0]?.delta;
					if (typeof delta?.content === "string" && delta.content.length > 0) {
						output += delta.content;
					}
					// Token counts often come in the final chunk.
					// Preserve zeros by checking undefined explicitly.
					if (chunk.usage?.prompt_tokens !== undefined) {
						promptTokens = chunk.usage.prompt_tokens;
					}
					if (chunk.usage?.completion_tokens !== undefined) {
						completionTokens = chunk.usage.completion_tokens;
					}
				} catch (err) {
					log.debug(
						{ err, raw: data },
						"Skipping malformed SSE chunk",
					);
				}
			}
		}

		// Flush any remaining decoded text.
		buffer += decoder.decode();

		// Process any remaining buffer content
		if (buffer.trim().startsWith("data: ")) {
			const data = buffer.trim().slice(6);
			if (data !== "[DONE]") {
				try {
					const parsed = JSON.parse(data) as unknown;
					const result = ChatCompletionChunkSchema.safeParse(parsed);
					if (result.success) {
						const chunk = result.data;
						const delta = chunk.choices?.[0]?.delta;
						if (typeof delta?.content === "string" && delta.content.length > 0) {
							output += delta.content;
						}
						if (chunk.usage?.prompt_tokens !== undefined) {
							promptTokens = chunk.usage.prompt_tokens;
						}
						if (chunk.usage?.completion_tokens !== undefined) {
							completionTokens = chunk.usage.completion_tokens;
						}
					}
				} catch (err) {
					log.debug(
						{ err, raw: data },
						"Skipping malformed SSE chunk",
					);
				}
			}
		}

		return { output, promptTokens, completionTokens };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (timedOut || errorMessage.toLowerCase().includes("timed out")) {
			throw new Error(
				`OpenAI-compatible request timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout for large models.`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}
