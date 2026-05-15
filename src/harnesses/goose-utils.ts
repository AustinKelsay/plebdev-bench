/**
 * Purpose: Small Goose adapter validation and logging helpers.
 * Exports: normalizeTurnLimit, fingerprintText, sanitizeRuntimeBaseUrl
 *
 * Invariants:
 * - Turn limits are positive integers before reaching Goose.
 * - Log fingerprints and base URLs avoid leaking prompt or path details.
 */

import * as crypto from "node:crypto";

/**
 * Normalizes turn limits to safe positive integers.
 *
 * @param paramName - Option name for error context
 * @param value - User-supplied turn limit
 * @param fallback - Fallback turn limit when input is undefined
 * @returns Positive integer turn limit
 * @throws {TypeError} If value is provided but is not a positive integer
 */
export function normalizeTurnLimit(
	paramName: string,
	value: number | undefined,
	fallback: number,
): number {
	const candidate = value ?? fallback;
	if (
		typeof candidate !== "number" ||
		!Number.isInteger(candidate) ||
		candidate < 1
	) {
		throw new TypeError(
			`${paramName} must be a positive integer, received ${String(candidate)}`,
		);
	}
	return candidate;
}

/**
 * Produces a redaction-safe fingerprint for logs.
 *
 * @param text - Arbitrary text payload
 * @returns Short SHA-256 fingerprint prefix
 * @throws {never} Hashing a string payload does not throw
 */
export function fingerprintText(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * Sanitizes runtime base URL for logs by retaining origin only.
 *
 * @param baseUrl - Runtime base URL
 * @returns Safe origin string or redacted fallback
 * @throws {never} Invalid URLs return a redacted fallback
 */
export function sanitizeRuntimeBaseUrl(baseUrl: string): string {
	try {
		return new URL(baseUrl).origin;
	} catch {
		return "REDACTED";
	}
}
