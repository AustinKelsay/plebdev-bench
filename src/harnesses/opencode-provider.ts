/**
 * Purpose: Runtime-to-OpenCode provider mapping for direct CLI runs.
 * Exports: OpenCodeProviderSpec, buildOpenCodeProviderSpec,
 *          toOpenAiCompatBaseUrl, toOpenCodeModelKey
 *
 * Invariants:
 * - Runtime provider IDs are stable transport identifiers.
 * - OpenAI-compatible base URLs end with `/v1`.
 * - Runtime model names are preserved in config even when CLI transport keys
 *   need slash-safe normalization.
 */

import { z } from "zod";

const BuildOpenCodeProviderSpecOptsSchema = z.object({
	runtimeName: z.literal("ollama"),
	runtimeBaseUrl: z.string().min(1),
	model: z.string().trim().min(1),
});

const MODEL_KEY_PERCENT_ESCAPE = "%25";
const MODEL_KEY_SLASH_ESCAPE = "%2F";

/** Provider details needed to run an OpenCode CLI request. */
export interface OpenCodeProviderSpec {
	/** Stable OpenCode provider ID used in `provider/model` CLI args. */
	providerId: "ollama";
	/** Display label for the generated OpenCode provider. */
	providerName: string;
	/** AI SDK provider package used by OpenCode. */
	npmPackage: "@ai-sdk/openai-compatible";
	/** OpenAI-compatible provider base URL. */
	baseURL: string;
	/** Exact model identifier used by the runtime. */
	runtimeModelName: string;
	/** Slash-safe model key used in OpenCode config and CLI transport. */
	transportModelKey: string;
	/** Full `provider/model` argument passed to `opencode run --model`. */
	modelArg: string;
}

/**
 * Normalizes a runtime base URL to OpenAI-compatible form ending with `/v1`.
 *
 * @param baseUrl - Runtime base URL, for example `http://localhost:11434`
 * @returns Normalized URL ending in `/v1`
 * @throws {Error} If the URL is empty after trimming
 */
export function toOpenAiCompatBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (!trimmed) {
		throw new Error("OpenCode base URL must be non-empty");
	}
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/**
 * Builds a slash-safe OpenCode model key from a runtime model ID.
 *
 * OpenCode expects `--model` in `provider/model` form. Runtime model IDs may
 * contain slashes, so the generated config exposes a reversible percent-escaped
 * transport key while retaining the exact runtime model name in the provider
 * model entry.
 *
 * @param model - Runtime model identifier
 * @returns Slash-safe model key
 * @throws {Error} If the model string is empty after trimming
 */
export function toOpenCodeModelKey(model: string): string {
	const trimmed = model.trim();
	if (!trimmed) {
		throw new Error("OpenCode model must be non-empty");
	}
	return trimmed
		.replaceAll("%", MODEL_KEY_PERCENT_ESCAPE)
		.replaceAll("/", MODEL_KEY_SLASH_ESCAPE);
}

/**
 * Builds the generated OpenCode provider spec for a benchmark runtime/model.
 *
 * @param opts - Runtime name, runtime base URL, and runtime model name
 * @returns Provider spec consumed by config and CLI argument builders
 * @throws z.ZodError when options fail validation
 * @throws {Error} When base URL or model normalization fails
 */
export function buildOpenCodeProviderSpec(opts: {
	runtimeName: "ollama";
	runtimeBaseUrl: string;
	model: string;
}): OpenCodeProviderSpec {
	const parsed = BuildOpenCodeProviderSpecOptsSchema.parse(opts);
	const providerId = parsed.runtimeName;
	const transportModelKey = toOpenCodeModelKey(parsed.model);

	return {
		providerId,
		providerName: "Ollama (local)",
		npmPackage: "@ai-sdk/openai-compatible",
		baseURL: toOpenAiCompatBaseUrl(parsed.runtimeBaseUrl),
		runtimeModelName: parsed.model,
		transportModelKey,
		modelArg: `${providerId}/${transportModelKey}`,
	};
}
