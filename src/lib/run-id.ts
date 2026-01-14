/**
 * Purpose: Generate unique, sortable run IDs for benchmark runs.
 * Exports: generateRunId
 *
 * Format: YYYYMMDD-HHmmss-XXXXXX
 * Example: 20260114-143052-a7b3c2
 */

/**
 * Generates a unique run ID based on timestamp and random suffix.
 *
 * @returns A unique run ID in format: YYYYMMDD-HHmmss-XXXXXX
 *
 * @example
 * const runId = generateRunId();
 * // Returns something like: '20260114-143052-a7b3c2'
 */
export function generateRunId(): string {
	const now = new Date();

	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	const seconds = String(now.getSeconds()).padStart(2, "0");

	const datePart = `${year}${month}${day}`;
	const timePart = `${hours}${minutes}${seconds}`;

	// 6 character random hex suffix for uniqueness
	const randomPart = Math.random().toString(16).substring(2, 8);

	return `${datePart}-${timePart}-${randomPart}`;
}

/**
 * Parses a run ID to extract its components.
 *
 * @param runId - The run ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseRunId(
	runId: string,
): { date: string; time: string; random: string } | null {
	const match = runId.match(/^(\d{8})-(\d{6})-([a-f0-9]{6})$/);
	if (!match) return null;

	return {
		date: match[1],
		time: match[2],
		random: match[3],
	};
}
