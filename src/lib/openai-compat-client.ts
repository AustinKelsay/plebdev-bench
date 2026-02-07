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

import type { GenerateResponse } from "./ollama-client.js";

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

/** SSE data event structure from OpenAI-compatible API. */
interface ChatCompletionChunk {
	id?: string;
	object?: string;
	choices?: Array<{
		index?: number;
		delta?: {
			role?: string;
			content?: string;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

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
					const chunk = JSON.parse(data) as ChatCompletionChunk;
					const delta = chunk.choices?.[0]?.delta;
					if (delta?.content) {
						output += delta.content;
					}
					// Token counts often come in the final chunk
					if (chunk.usage) {
						promptTokens = chunk.usage.prompt_tokens;
						completionTokens = chunk.usage.completion_tokens;
					}
				} catch {
					// Skip malformed JSON lines
				}
			}
		}

		// Process any remaining buffer content
		if (buffer.trim().startsWith("data: ")) {
			const data = buffer.trim().slice(6);
			if (data !== "[DONE]") {
				try {
					const chunk = JSON.parse(data) as ChatCompletionChunk;
					const delta = chunk.choices?.[0]?.delta;
					if (delta?.content) {
						output += delta.content;
					}
					if (chunk.usage) {
						promptTokens = chunk.usage.prompt_tokens;
						completionTokens = chunk.usage.completion_tokens;
					}
				} catch {
					// Skip malformed JSON
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
