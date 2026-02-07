/**
 * Purpose: Ollama runtime implementation.
 * Exports: createOllamaRuntime
 *
 * This runtime communicates with Ollama's HTTP API for:
 * - Health checks (GET /api/version)
 * - Model listing (GET /api/tags)
 * - Model info (POST /api/show)
 *
 * Invariants:
 * - All requests have a timeout via AbortController
 * - Connection errors are thrown, not swallowed
 */

import type { Runtime, ModelInfo } from "./runtime.js";

/** Configuration for the Ollama runtime. */
export interface OllamaRuntimeConfig {
	/** Ollama API base URL (e.g., "http://localhost:11434"). */
	baseUrl: string;
	/** Default timeout for requests in milliseconds. */
	defaultTimeoutMs: number;
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
 * Creates an Ollama runtime instance.
 *
 * @param config - Runtime configuration
 * @returns Runtime instance for Ollama
 */
export function createOllamaRuntime(config: OllamaRuntimeConfig): Runtime {
	const { baseUrl, defaultTimeoutMs } = config;

	return {
		name: "ollama" as const,
		baseUrl,
		apiFormat: "ollama" as const,

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
	};
}
