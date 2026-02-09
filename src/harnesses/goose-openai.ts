/**
 * Purpose: Goose OpenAI-provider URL normalization helpers.
 * Exports: normalizeOpenAiBasePath
 *
 * Goose expects OPENAI_HOST plus OPENAI_BASE_PATH that points to an API root,
 * not a specific endpoint. These helpers keep the adapter logic small and
 * prevent accidental "/chat/completions" duplication.
 *
 * Invariants:
 * - Returned base path is a relative path fragment (no leading "/")
 * - Empty paths normalize to "v1"
 */

/**
 * Normalizes an OpenAI-compatible base path for Goose.
 *
 * @param pathname - URL pathname (e.g., "/v1" or "/v1/chat/completions")
 * @returns Normalized base path (e.g., "v1")
 */
export function normalizeOpenAiBasePath(pathname: string): string {
	const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!trimmed) return "v1";

	const suffix = "/chat/completions";
	const lower = trimmed.toLowerCase();
	if (lower.endsWith(suffix)) {
		const without = trimmed.slice(0, -suffix.length);
		return without.length > 0 ? without : "v1";
	}

	return trimmed;
}
