/**
 * Purpose: Direct HTTP adapter implementing the Harness interface.
 * Exports: createDirectAdapter
 *
 * This adapter communicates directly with the runtime's HTTP API.
 * For Ollama runtime, it uses POST /api/generate for completions.
 *
 * The "direct" harness is the simplest - it sends prompts directly
 * to the runtime without any CLI wrapper.
 *
 * Invariants:
 * - Uses runtime.baseUrl for API calls
 * - Streaming mode keeps connection alive during model loading (critical for bf16)
 */

import type { Harness, GenerateOpts, GenerateResult } from "./harness.js";

/** Prompt prefix instructing the model to output code in markdown blocks. */
const DIRECT_PROMPT_PREFIX = `Output only TypeScript code as a single markdown code block (\`\`\`typescript).
No explanations, just the code.

Task:

`;

/**
 * Creates a direct harness adapter.
 *
 * The direct adapter always returns true for ping() since availability
 * is determined by the runtime, not the harness.
 *
 * @returns Harness instance for direct HTTP communication
 */
export function createDirectAdapter(): Harness {
	return {
		name: "direct" as const,

		async ping(): Promise<boolean> {
			// Direct harness is always available - runtime availability is checked separately
			return true;
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const { runtime, model, prompt, timeoutMs, unloadAfter } = opts;
			const startTime = performance.now();
			const keepAlive = unloadAfter ? 0 : "5m";

			// Prepend prompt prefix for markdown code block output
			const fullPrompt = DIRECT_PROMPT_PREFIX + prompt;

			// Use streaming to keep connection alive during model loading (critical for bf16 cold starts)
			const controller = new AbortController();
			let timedOut = false;
			const timeoutId = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, timeoutMs);

			try {
				const response = await fetch(`${runtime.baseUrl}/api/generate`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model,
						prompt: fullPrompt,
						stream: true, // Streaming keeps connection alive during model loading
						keep_alive: keepAlive,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error(
						`Generation failed: ${response.status} ${response.statusText}`,
					);
				}

				// Accumulate streamed response
				let output = "";
				let promptTokens: number | undefined;
				let completionTokens: number | undefined;

				const reader = response.body?.getReader();
				if (!reader) throw new Error("No response body");

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

				const durationMs = Math.round(performance.now() - startTime);
				return { output, durationMs, promptTokens, completionTokens };
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (timedOut || errorMessage.toLowerCase().includes("timed out")) {
					throw new Error(
						`Request timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout for large models.`,
					);
				}
				throw error;
			} finally {
				clearTimeout(timeoutId);
			}
		},
	};
}
