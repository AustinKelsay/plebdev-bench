/**
 * Purpose: Ollama HTTP adapter implementing the Harness interface.
 * Exports: createOllamaAdapter
 *
 * This adapter communicates directly with Ollama's HTTP API.
 * Endpoints used:
 * - GET /api/version → health check
 * - GET /api/tags → list local models
 * - POST /api/generate → generate completion (streaming mode)
 *
 * Invariants:
 * - All requests have a timeout via AbortController
 * - Connection errors are thrown, not swallowed
 * - Streaming mode keeps connection alive during model loading (critical for bf16)
 */

import type { Harness, GenerateOpts, GenerateResult, ModelInfo } from "./harness.js";

/** Configuration for the Ollama adapter. */
export interface OllamaAdapterConfig {
	/** Ollama API base URL (e.g., "http://localhost:11434"). */
	baseUrl: string;
	/** Default timeout for requests in milliseconds. */
	defaultTimeoutMs: number;
}

/**
 * Creates an Ollama harness adapter.
 *
 * @param config - Adapter configuration
 * @returns Harness instance for Ollama
 */
export function createOllamaAdapter(config: OllamaAdapterConfig): Harness {
	const { baseUrl, defaultTimeoutMs } = config;

	/**
	 * Makes a fetch request with timeout.
	 * Throws a descriptive error on timeout instead of generic "aborted".
	 */
	async function fetchWithTimeout(
		url: string,
		timeoutMs: number,
		options: RequestInit = {},
	): Promise<Response> {
		const controller = new AbortController();
		let timedOut = false;
		const timeoutId = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			return response;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			// Check both our flag AND error message (external timeouts won't set our flag)
			if (timedOut || errorMessage.toLowerCase().includes("timed out")) {
				throw new Error(
					`Request timed out after ${Math.round(timeoutMs / 1000)}s. Try increasing --timeout for large models.`,
				);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	return {
		name: "ollama" as const,

		async ping(): Promise<boolean> {
			try {
				const response = await fetchWithTimeout(
					`${baseUrl}/api/version`,
					defaultTimeoutMs,
				);
				return response.ok;
			} catch {
				return false;
			}
		},

		async listModels(): Promise<string[]> {
			const response = await fetchWithTimeout(
				`${baseUrl}/api/tags`,
				defaultTimeoutMs,
			);

			if (!response.ok) {
				throw new Error(
					`Failed to list models: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as {
				models: Array<{
					name: string;
					size: number;
					modified_at: string;
					digest: string;
				}>;
			};

			return data.models.map((m) => m.name);
		},

		async getModelInfo(model: string): Promise<ModelInfo> {
			const response = await fetchWithTimeout(
				`${baseUrl}/api/show`,
				defaultTimeoutMs,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: model }),
				},
			);

			if (!response.ok) {
				throw new Error(
					`Failed to get model info: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as {
				details?: {
					parameter_size?: string; // e.g., "8B", "70B", "1.7B"
				};
				model_info?: {
					"general.parameter_count"?: number;
				};
			};

			// Try to parse parameter count from various sources
			let parametersBillions = 7; // Default fallback

			// First try model_info.general.parameter_count (most accurate)
			if (data.model_info?.["general.parameter_count"]) {
				parametersBillions = data.model_info["general.parameter_count"] / 1e9;
			}
			// Then try details.parameter_size string (e.g., "8B", "70B")
			else if (data.details?.parameter_size) {
				const match = data.details.parameter_size.match(/([\d.]+)([BMK]?)/i);
				if (match) {
					let value = parseFloat(match[1]);
					const unit = match[2]?.toUpperCase();
					if (unit === "M") value /= 1000;
					else if (unit === "K") value /= 1_000_000;
					parametersBillions = value;
				}
			}

			// Estimate size in bytes (rough: ~0.5-1 byte per parameter for quantized)
			const sizeBytes = parametersBillions * 1e9 * 0.6;

			return {
				name: model,
				sizeBytes,
				parametersBillions,
			};
		},

		async generate(opts: GenerateOpts): Promise<GenerateResult> {
			const startTime = performance.now();
			const keepAlive = opts.unloadAfter ? 0 : "5m";

			// Use streaming to keep connection alive during model loading (critical for bf16 cold starts)
			const controller = new AbortController();
			let timedOut = false;
			const timeoutId = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, opts.timeoutMs);

			try {
				const response = await fetch(`${baseUrl}/api/generate`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: opts.model,
						prompt: opts.prompt,
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
						`Request timed out after ${Math.round(opts.timeoutMs / 1000)}s. Try increasing --timeout for large models.`,
					);
				}
				throw error;
			} finally {
				clearTimeout(timeoutId);
			}
		},
	};
}
