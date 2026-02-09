/**
 * Purpose: Direct HTTP adapter implementing the Harness interface.
 * Exports: createDirectAdapter
 *
 * This adapter communicates directly with the runtime's HTTP API.
 * Dispatches to appropriate client based on runtime.apiFormat:
 * - "ollama": Uses POST /api/generate with NDJSON streaming
 * - "openai-compat": Uses POST /v1/chat/completions with SSE streaming
 *
 * The "direct" harness is the simplest - it sends prompts directly
 * to the runtime without any CLI wrapper.
 *
 * Invariants:
 * - Uses runtime.baseUrl for API calls
 * - Streaming mode keeps connection alive during model loading (critical for bf16)
 */

import { generateOllama } from "../lib/ollama-client.js";
import { generateOpenAiCompat } from "../lib/openai-compat-client.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";

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

			// Prepend prompt prefix for markdown code block output
			const fullPrompt = DIRECT_PROMPT_PREFIX + prompt;

			// Dispatch to appropriate client based on runtime API format
			let output: string;
			let promptTokens: number | undefined;
			let completionTokens: number | undefined;

			switch (runtime.apiFormat) {
				case "ollama": {
					const response = await generateOllama({
						baseUrl: runtime.baseUrl,
						model,
						prompt: fullPrompt,
						timeoutMs,
						keepAlive: unloadAfter ? 0 : "5m",
					});
					output = response.output;
					promptTokens = response.promptTokens;
					completionTokens = response.completionTokens;
					break;
				}

				case "openai-compat": {
					const response = await generateOpenAiCompat({
						baseUrl: runtime.baseUrl,
						model,
						prompt: fullPrompt,
						timeoutMs,
						apiKey: process.env.VLLM_API_KEY,
					});
					output = response.output;
					promptTokens = response.promptTokens;
					completionTokens = response.completionTokens;
					break;
				}

				default: {
					const _exhaustive: never = runtime.apiFormat;
					throw new Error(`Unsupported API format: ${_exhaustive}`);
				}
			}

			const durationMs = Math.round(performance.now() - startTime);
			return { output, durationMs, promptTokens, completionTokens };
		},
	};
}
