/**
 * Purpose: Formatting helpers for run comparison values.
 * Exports: formatDelta
 *
 * Invariants:
 * - Delta strings include a sign and the terminal-native delta marker.
 */

/**
 * Formats a delta value with sign and color-independent marker.
 *
 * @param value - Delta value
 * @param suffix - Optional suffix, such as `%` or `/10`
 * @returns Formatted delta string
 * @throws {TypeError} If value is not a finite number
 */
export function formatDelta(value: number, suffix = ""): string {
	if (!Number.isFinite(value)) {
		throw new TypeError("formatDelta value must be a finite number");
	}
	const sign = value > 0 ? "+" : "";
	const formatted = `${sign}${value.toFixed(1)}${suffix}`;
	return `Δ ${formatted}`;
}
