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
export async function generateOllama(opts: OllamaGenerateOpts): Promise<GenerateResponse> {
	const { baseUrl, model, prompt, timeoutMs, keepAlive = "5m" } = opts;

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
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			// Parse NDJSON chunks (Ollama streams newline-delimited JSON)
			const chunk = decoder.decode(value, { stream: true });
			for (const line of chunk.split("\n").filter(Boolean)) {
				const data = JSON.parse(line) as {
					response?: string;
					done?: boolean;
					prompt_eval_count?: number;
					eval_count?: number;
				};
				if (data.response) output += data.response;
				if (data.prompt_eval_count) promptTokens = data.prompt_eval_count;
				if (data.eval_count) completionTokens = data.eval_count;
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
