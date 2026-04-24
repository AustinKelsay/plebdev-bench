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

import { z } from "zod";
import type { ModelInfo, Runtime } from "./runtime.js";

/** Schema for GET /api/tags response. */
const TagsResponseSchema = z
	.object({
		models: z.array(
			z
				.object({
					name: z.string(),
					size: z.number(),
					modified_at: z.string(),
					digest: z.string(),
				})
				.passthrough(),
		),
	})
	.passthrough();

/** Schema for POST /api/show response. */
const ShowResponseSchema = z
	.object({
		details: z
			.object({
				parameter_size: z.string().optional(),
				family: z.string().optional(),
				families: z.array(z.string()).optional(),
			})
			.passthrough()
			.optional(),
		model_info: z.record(z.unknown()).optional(),
	})
	.passthrough();

/**
 * Architecture tokens and family names commonly used by embedding-only models.
 *
 * Heuristics are based on Ollama `/api/show` metadata, popular vendor naming
 * conventions, and the benchmark's need to exclude embedding-only models from
 * text-generation rows. This list is intentionally small and may still miss
 * edge cases; update it when new embedding families appear in benchmark runs.
 */
const EMBEDDING_ARCHITECTURES = new Set(["bert", "nomic-bert", "nomic_bert"]);
const EMBEDDING_NAME_PATTERNS = [
	/(^|[-_:])embed($|[-_:])/i,
	/(^|[-_:])embedding($|[-_:])/i,
	/^nomic-embed/i,
	/^bge[-_:]/i,
	/^e5[-_:]/i,
] as const;
/**
 * Architecture tokens and family names commonly used by text-generation models.
 *
 * These heuristics cover current benchmark families such as Llama, Qwen,
 * Mistral, Gemma, DeepSeek, and GPT-OSS. They are derived from vendor naming
 * conventions and observed Ollama metadata rather than a formal registry.
 * Update TEXT_GENERATION_ARCHITECTURES and TEXT_GENERATION_NAME_PATTERNS when
 * new benchmarked model families appear; add entries only for families with
 * confirmed text-generation behavior so novel architectures still fall back to
 * `"unknown"`.
 */
const TEXT_GENERATION_ARCHITECTURES = new Set([
	"llama",
	"qwen2",
	"qwen3",
	"mistral",
	"mixtral",
	"gemma",
	"gemma2",
	"gemma3",
	"deepseek",
	"phi3",
	"phi4",
	"gpt-oss",
]);
const TEXT_GENERATION_NAME_PATTERNS = [
	/^llama/i,
	/^qwen/i,
	/^mistral/i,
	/^mixtral/i,
	/^gemma/i,
	/^deepseek/i,
	/^phi[-_:]?/i,
	/^gpt-oss/i,
] as const;

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
 * Reads a string value from Ollama model_info metadata.
 *
 * @param modelInfo - Parsed model_info record
 * @param key - Metadata key
 * @returns Non-empty string value when present
 */
function readModelInfoString(
	modelInfo: Record<string, unknown> | undefined,
	key: string,
): string | undefined {
	const value = modelInfo?.[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

/**
 * Infers whether a model is suitable for text generation benchmarks.
 *
 * @param model - Runtime model name
 * @param details - Ollama `/api/show` details object
 * @param modelInfo - Ollama `/api/show` model_info object
 * @returns Coarse model kind for benchmark eligibility
 */
function inferModelKind(
	model: string,
	details: z.infer<typeof ShowResponseSchema>["details"],
	modelInfo: Record<string, unknown> | undefined,
): "text-generation" | "embedding" | "unknown" {
	const architecture = readModelInfoString(modelInfo, "general.architecture");
	const families = [
		...(details?.family ? [details.family] : []),
		...(details?.families ?? []),
		...(architecture ? [architecture] : []),
	].map((value) => value.toLowerCase());

	if (families.some((family) => EMBEDDING_ARCHITECTURES.has(family))) {
		return "embedding";
	}
	if (EMBEDDING_NAME_PATTERNS.some((pattern) => pattern.test(model))) {
		return "embedding";
	}
	if (families.some((family) => TEXT_GENERATION_ARCHITECTURES.has(family))) {
		return "text-generation";
	}
	if (TEXT_GENERATION_NAME_PATTERNS.some((pattern) => pattern.test(model))) {
		return "text-generation";
	}
	return "unknown";
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
			const endpoint = `${baseUrl}/api/tags`;
			const response = await fetchWithTimeout(endpoint, defaultTimeoutMs);

			if (!response.ok) {
				throw new Error(
					`Failed to list models: ${response.status} ${response.statusText}`,
				);
			}

			const json = await response.json();
			const result = TagsResponseSchema.safeParse(json);
			if (!result.success) {
				throw new Error(
					`Invalid response from ${endpoint}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
				);
			}

			return result.data.models.map((m) => m.name);
		},

		async getModelInfo(model: string): Promise<ModelInfo> {
			const endpoint = `${baseUrl}/api/show`;
			const response = await fetchWithTimeout(endpoint, defaultTimeoutMs, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: model }),
			});

			if (!response.ok) {
				throw new Error(
					`Failed to get model info: ${response.status} ${response.statusText}`,
				);
			}

			const json = await response.json();
			const result = ShowResponseSchema.safeParse(json);
			if (!result.success) {
				throw new Error(
					`Invalid response from ${endpoint}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
				);
			}

			const data = result.data;

			// Try to parse parameter count from various sources
			let parametersBillions = 7; // Default fallback

			// First try model_info.general.parameter_count (most accurate)
			const paramCount = data.model_info?.["general.parameter_count"];
			if (typeof paramCount === "number") {
				parametersBillions = paramCount / 1e9;
			}
			// Then try details.parameter_size string (e.g., "8B", "70B")
			else if (data.details?.parameter_size) {
				const match = data.details.parameter_size.match(/([\d.]+)([BMK]?)/i);
				if (match) {
					let value = Number.parseFloat(match[1]);
					const unit = match[2]?.toUpperCase();
					if (unit === "M") value /= 1000;
					else if (unit === "K") value /= 1_000_000;
					parametersBillions = value;
				}
			}

			// Estimate size in bytes (rough: ~0.5-1 byte per parameter for quantized)
			const sizeBytes = parametersBillions * 1e9 * 0.6;
			const architecture = readModelInfoString(
				data.model_info,
				"general.architecture",
			);
			const modelKind = inferModelKind(model, data.details, data.model_info);

			return {
				name: model,
				sizeBytes,
				parametersBillions,
				modelKind,
				capabilities: {
					generateText:
						modelKind === "text-generation" || modelKind === "unknown",
					embedText: modelKind === "embedding",
				},
				metadata: {
					...(data.details?.family ? { family: data.details.family } : {}),
					...(data.details?.families
						? { families: data.details.families }
						: {}),
					...(architecture ? { architecture } : {}),
				},
			};
		},
	};
}
