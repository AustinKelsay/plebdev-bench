/**
 * Purpose: Ollama HTTP client for /api/generate endpoint.
 * Exports: generateOllama, OllamaGenerateOpts, GenerateResponse
 *
 * Handles NDJSON streaming from Ollama's generation API.
 * Streaming mode keeps connection alive during model loading (critical for bf16 cold starts).
 *
 * Invariants:
 * - All requests have a timeout via AbortController
 * - Throws descriptive errors on timeout
 */

import { z } from "zod";
import { logger } from "./logger.js";

/** Options for Ollama generation. */
export interface OllamaGenerateOpts {
	/** Ollama API base URL (e.g., "http://localhost:11434"). */
	baseUrl: string;
	/** Model name in Ollama format (e.g., "llama3.2:3b"). */
	model: string;
	/** The prompt to send to the model. */
	prompt: string;
	/** Timeout in milliseconds. */
	timeoutMs: number;
	/** Keep-alive setting: 0 to unload immediately, "5m" to keep loaded, etc. */
	keepAlive?: string | number;
}

/** Response from generation. */
export interface GenerateResponse {
	/** The generated output text. */
	output: string;
	/** Number of prompt tokens (if available). */
	promptTokens?: number;
	/** Number of completion tokens (if available). */
	completionTokens?: number;
}

const OllamaStreamChunkSchema = z
	.object({
		response: z.string().optional(),
		done: z.boolean().optional(),
		prompt_eval_count: z.number().int().nonnegative().optional(),
		eval_count: z.number().int().nonnegative().optional(),
	})
	.passthrough();

/**
 * Generates text using Ollama's /api/generate endpoint.
 *
 * Uses streaming to keep connection alive during model loading.
 * Parses NDJSON response chunks to accumulate the full output.
 *
 * @param opts - Generation options
 * @returns Generation response with output and optional token counts
 * @throws Error on timeout or HTTP failure
 */
export async function generateOllama(
	opts: OllamaGenerateOpts,
): Promise<GenerateResponse> {
	const { baseUrl, model, prompt, timeoutMs, keepAlive = "5m" } = opts;
	const log = logger.child({ module: "ollama-client", model });

	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	try {
		const response = await fetch(`${baseUrl}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt,
				stream: true,
				keep_alive: keepAlive,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(
				`Ollama generation failed: ${response.status} ${response.statusText}`,
			);
		}

		// Accumulate streamed response
		let output = "";
		let promptTokens: number | undefined;
		let completionTokens: number | undefined;

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body from Ollama");

		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			// Parse NDJSON chunks (Ollama streams newline-delimited JSON).
			// Must buffer partial lines across chunks.
			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split("\n");
			buffer = lines.pop() ?? ""; // keep trailing partial line

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				let parsed: unknown;
				try {
					parsed = JSON.parse(trimmed) as unknown;
				} catch (err) {
					log.debug(
						{ err, linePreview: trimmed.slice(0, 200) },
						"Skipping invalid NDJSON line from Ollama stream",
					);
					continue;
				}

				const result = OllamaStreamChunkSchema.safeParse(parsed);
				if (!result.success) {
					log.debug(
						{ issues: result.error.issues },
						"Skipping NDJSON line that failed schema validation",
					);
					continue;
				}

				const data = result.data;
				if (typeof data.response === "string" && data.response.length > 0) {
					output += data.response;
				}
				// Preserve zeros by checking undefined explicitly.
				if (data.prompt_eval_count !== undefined) {
					promptTokens = data.prompt_eval_count;
				}
				if (data.eval_count !== undefined) {
					completionTokens = data.eval_count;
				}
			}
		}

		// Flush any remaining buffered line (common when the stream doesn't end with "\n").
		buffer += decoder.decode();
		const trailing = buffer.trim();
		if (trailing.length > 0) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(trailing) as unknown;
			} catch (err) {
				log.debug(
					{ err, linePreview: trailing.slice(0, 200) },
					"Skipping invalid trailing NDJSON line from Ollama stream",
				);
				parsed = undefined;
			}

			if (parsed !== undefined) {
				const result = OllamaStreamChunkSchema.safeParse(parsed);
				if (!result.success) {
					log.debug(
						{ issues: result.error.issues },
						"Skipping trailing NDJSON line that failed schema validation",
					);
				} else {
					const data = result.data;
					if (typeof data.response === "string" && data.response.length > 0) {
						output += data.response;
					}
					if (data.prompt_eval_count !== undefined) {
						promptTokens = data.prompt_eval_count;
					}
					if (data.eval_count !== undefined) {
						completionTokens = data.eval_count;
					}
				}
			}
		}

		return { output, promptTokens, completionTokens };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (timedOut || errorMessage.toLowerCase().includes("timed out")) {
			throw new Error(
				`Ollama request timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout for large models.`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}
