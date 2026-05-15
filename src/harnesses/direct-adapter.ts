/**
 * Purpose: Direct HTTP adapter implementing the Harness interface.
 * Exports: createDirectAdapter
 *
 * This adapter communicates directly with Ollama's HTTP API.
 *
 * The "direct" harness is the simplest - it sends prompts directly
 * to the runtime without any CLI wrapper.
 *
 * Invariants:
 * - Uses runtime.baseUrl for API calls
 * - Streaming mode keeps connection alive during model loading (critical for bf16)
 */

import { generateOllama } from "../lib/ollama-client.js";
import { appendSignalAssessmentReasons } from "../lib/signal-assessment.js";
import {
	appendRetryMarker,
	buildCodeOnlyPrompt,
	evaluateCodeOnlyOutput,
	hasRetryMarker,
	stripRetryMarker,
} from "./code-output-policy.js";
import type { GenerateOpts, GenerateResult, Harness } from "./harness.js";
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

			const fullPrompt = buildCodeOnlyPrompt(
				promptWithoutMarker,
				isRetryAttempt,
			);

			if (runtime.name !== "ollama" || runtime.apiFormat !== "ollama") {
				throw new Error(
					`Direct adapter requires an Ollama runtime; received runtime="${runtime.name}" apiFormat="${runtime.apiFormat}"`,
				);
			}

			const response = await generateOllama({
				baseUrl: runtime.baseUrl,
				model,
				prompt: fullPrompt,
				timeoutMs,
				keepAlive: unloadAfter ? 0 : "5m",
			});
			const output = response.output;
			const promptTokens = response.promptTokens;
			const completionTokens = response.completionTokens;

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
						...(initialPromptTokens !== undefined ||
						retryResult.promptTokens !== undefined
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
						...(decision.taintReasons.length > 0 ||
						retryResult.signalAssessment !== undefined
							? {
									signalAssessment: appendSignalAssessmentReasons(
										retryResult.signalAssessment,
										decision.taintReasons,
									),
								}
							: {}),
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
