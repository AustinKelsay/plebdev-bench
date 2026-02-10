/**
 * Purpose: Shared OpenCode model/base URL normalization helpers.
 * Exports: toOpenAiCompatBaseUrl, toOpenCodeModelKey
 *
 * Invariants:
 * - OpenAI-compatible base URLs end with `/v1`
 * - OpenCode model keys are slash-safe to avoid provider/model parsing ambiguity
 * - Empty model/base URL inputs are treated as programmer errors
 */

/**
 * Normalizes a runtime base URL to OpenAI-compatible form ending with `/v1`.
 *
 * @param baseUrl - Runtime base URL (for example `http://localhost:11434`)
 * @returns Normalized URL ending in `/v1`
 * @throws {Error} If the base URL is empty after trimming
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
 * OpenCode expects `--model` in `provider/model` format. Runtime model IDs such
 * as `Qwen/Qwen2.5-14B-Instruct` contain slashes, so we map them to a stable key
 * for CLI transport and keep the original model name in provider config.
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
	return trimmed.includes("/") ? trimmed.replaceAll("/", "__") : trimmed;
}
