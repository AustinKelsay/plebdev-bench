/**
 * Purpose: vLLM runtime implementation (OpenAI-compatible API).
 * Exports: createVllmRuntime
 *
 * This runtime communicates with vLLM's OpenAI-compatible HTTP API for:
 * - Health checks (GET /health, fallback to GET /v1/models)
 * - Model listing (GET /v1/models)
 * - Model info (estimated from model name parsing)
 *
 * Invariants:
 * - All requests have a timeout via AbortController
 * - Connection errors are thrown, not swallowed
 * - vLLM doesn't expose parameter counts, so we estimate from model names
 */

import type { Runtime, ModelInfo } from "./runtime.js";
import { logger } from "../lib/logger.js";

/** Configuration for the vLLM runtime. */
export interface VllmRuntimeConfig {
	/** vLLM API base URL (e.g., "http://localhost:8000"). */
	baseUrl: string;
	/** Default timeout for requests in milliseconds. */
	defaultTimeoutMs: number;
	/** Optional API key for authenticated endpoints. */
	apiKey?: string;
}

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

/**
 * Estimates parameter count in billions from model name.
 * Parses common patterns like "llama-7b", "mistral-7B", "qwen2-72b", etc.
 *
 * @param modelName - Model name to parse
 * @returns Estimated parameter count in billions (default 7 if unknown)
 */
export function estimateParametersFromName(modelName: string): number {
	// Match patterns like "7b", "70B", "1.7b", "72B", etc.
	const match = modelName.match(/([\d.]+)\s*[bB]/i);
	if (match) {
		const value = parseFloat(match[1]);
		if (!Number.isNaN(value) && value > 0) {
			return value;
		}
	}

	// Match patterns with millions like "350m", "1.3M"
	const millionMatch = modelName.match(/([\d.]+)\s*[mM]/i);
	if (millionMatch) {
		const value = parseFloat(millionMatch[1]);
		if (!Number.isNaN(value) && value > 0) {
			return value / 1000; // Convert millions to billions
		}
	}

	// Default fallback
	return 7;
}

/**
 * Creates a vLLM runtime instance.
 *
 * @param config - Runtime configuration
 * @returns Runtime instance for vLLM
 */
export function createVllmRuntime(config: VllmRuntimeConfig): Runtime {
	const { baseUrl, defaultTimeoutMs, apiKey } = config;

	/** Builds headers with optional auth. */
	function buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		// Only add auth if key is provided and not "dummy"
		if (apiKey && apiKey !== "dummy") {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}
		return headers;
	}

	return {
		name: "vllm" as const,
		baseUrl,
		apiFormat: "openai-compat" as const,

		async ping(): Promise<boolean> {
			const log = logger.child({ runtime: "vllm", baseUrl });
			try {
				// Try /health endpoint first (vLLM standard)
				const healthResponse = await fetchWithTimeout(
					`${baseUrl}/health`,
					defaultTimeoutMs,
					{ headers: buildHeaders() },
				);
				if (healthResponse.ok) {
					return true;
				}
				log.debug(
					{ url: `${baseUrl}/health`, status: healthResponse.status },
					"vLLM /health returned non-ok status",
				);
			} catch (error) {
				log.debug(
					{ err: error, url: `${baseUrl}/health` },
					"vLLM /health request failed",
				);
			}

			try {
				// Fall back to /v1/models (OpenAI-compatible)
				const modelsResponse = await fetchWithTimeout(
					`${baseUrl}/v1/models`,
					defaultTimeoutMs,
					{ headers: buildHeaders() },
				);
				if (!modelsResponse.ok) {
					log.debug(
						{ url: `${baseUrl}/v1/models`, status: modelsResponse.status },
						"vLLM /v1/models returned non-ok status",
					);
				}
				return modelsResponse.ok;
			} catch (error) {
				log.debug(
					{ err: error, url: `${baseUrl}/v1/models` },
					"vLLM /v1/models request failed",
				);
				return false;
			}
		},

		async listModels(): Promise<string[]> {
			const response = await fetchWithTimeout(
				`${baseUrl}/v1/models`,
				defaultTimeoutMs,
				{ headers: buildHeaders() },
			);

			if (!response.ok) {
				throw new Error(
					`Failed to list models: ${response.status} ${response.statusText}`,
				);
			}

			// OpenAI-compatible format
			const data = (await response.json()) as {
				data: Array<{
					id: string;
					object: string;
					created?: number;
					owned_by?: string;
				}>;
			};

			return data.data.map((m) => m.id);
		},

		async getModelInfo(model: string): Promise<ModelInfo> {
			// vLLM doesn't expose parameter counts via API
			// Estimate from model name
			const parametersBillions = estimateParametersFromName(model);

			// Estimate size in bytes (rough: ~0.5-1 byte per parameter for quantized)
			const sizeBytes = parametersBillions * 1e9 * 0.6;

			return {
				name: model,
				sizeBytes,
				parametersBillions,
			};
		},
	};
}
