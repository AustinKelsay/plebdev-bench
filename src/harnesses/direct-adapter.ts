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

import { z } from "zod";
import {
	appendRetryMarker,
	buildCodeOnlyPrompt,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "./code-output-policy.js";
import { appendSignalAssessmentReasons } from "../lib/signal-assessment.js";
import { generateOllama } from "../lib/ollama-client.js";
import { generateOpenAiCompat } from "../lib/openai-compat-client.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
const VllmApiKeySchema = z.string().min(1).optional();
const vllmApiKey = VllmApiKeySchema.parse(process.env.VLLM_API_KEY);
const MIN_OUTPUT_LENGTH = 10;

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
			const isRetryAttempt = hasRetryMarker(prompt);
			const promptWithoutMarker = stripRetryMarker(prompt);

			const fullPrompt = buildCodeOnlyPrompt(promptWithoutMarker, isRetryAttempt);

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
						apiKey: vllmApiKey,
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

			const decision = evaluateCodeOnlyOutput(output, MIN_OUTPUT_LENGTH);
			if (decision.shouldRetry) {
				const elapsedMs = Math.round(performance.now() - startTime);
				const remainingMs = timeoutMs - elapsedMs;
				if (!isRetryAttempt && remainingMs > 1000) {
					const initialPromptTokens = promptTokens;
					const initialCompletionTokens = completionTokens;
					const retryResult = await createDirectAdapter().generate({
						...opts,
						prompt: appendRetryMarker(promptWithoutMarker),
						timeoutMs: remainingMs,
					});
					return {
						...retryResult,
						...(initialPromptTokens !== undefined || retryResult.promptTokens !== undefined
							? {
									promptTokens:
										(initialPromptTokens ?? 0) +
										(retryResult.promptTokens ?? 0),
								}
							: {}),
						...(initialCompletionTokens !== undefined ||
						retryResult.completionTokens !== undefined
							? {
									completionTokens:
										(initialCompletionTokens ?? 0) +
										(retryResult.completionTokens ?? 0),
								}
							: {}),
						durationMs: Math.round(performance.now() - startTime),
					};
				}
			}

			const durationMs = Math.round(performance.now() - startTime);
			return {
				output,
				durationMs,
				promptTokens,
				completionTokens,
				signalAssessment: appendSignalAssessmentReasons(
					undefined,
					decision.taintReasons,
				),
			};
		},
	};
}
