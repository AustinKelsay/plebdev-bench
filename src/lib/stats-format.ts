/**
 * Purpose: Terminal formatting helpers for benchmark run statistics.
 * Exports: formatRunStats
 *
 * Invariants:
 * - Formatting stays table-oriented and high-signal for non-interactive CLI use.
 * - Labels distinguish semantic scored-check rates from full item success rates.
 */

import type { RunStats } from "./stats.js";

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Compact display string
 */
function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${Math.round(remainingSeconds)}s`;
}

/**
 * Formats a number with thousands separators.
 *
 * @param value - Numeric value
 * @returns Locale-formatted string
 */
function formatNumber(value: number): string {
	return value.toLocaleString("en-US");
}

/**
 * Pads a string to a fixed width.
 *
 * @param str - Input string
 * @param width - Target width
 * @param align - Alignment direction
 * @returns Padded string
 */
function pad(
	str: string,
	width: number,
	align: "left" | "right" = "left",
): string {
	if (align === "right") return str.padStart(width);
	return str.padEnd(width);
}

/**
 * Formats run statistics for terminal output.
 *
 * @param stats - Run statistics
 * @param runId - Run identifier
 * @param completed - Number of completed items
 * @param failed - Number of failed items
 * @param total - Total number of items
 * @param durationMs - Total run duration
 * @param outputDir - Output directory path
 * @returns Formatted string for terminal output
 */
export function formatRunStats(
	stats: RunStats,
	runId: string,
	completed: number,
	failed: number,
	total: number,
	durationMs: number,
	outputDir: string,
): string {
	const lines: string[] = [];

	lines.push("");
	lines.push(`Run complete: ${runId}`);
	lines.push(`  Completed: ${completed}/${total}`);
	lines.push(`  Failed: ${failed}`);
	const generationFailureCount = stats.generationFailures?.total ?? 0;
	if (generationFailureCount > failed) {
		throw new Error(
			`generation failure count (${generationFailureCount}) cannot exceed failed item count (${failed})`,
		);
	}
	if (generationFailureCount > 0 || failed > generationFailureCount) {
		lines.push("  Failure breakdown:");
		for (const { type, count } of stats.generationFailures?.byType ?? []) {
			lines.push(`    ${type}: ${count}`);
		}
		const scoredRowFailures = failed - generationFailureCount;
		if (scoredRowFailures > 0) {
			lines.push(`    scored_row_failure: ${scoredRowFailures}`);
		}
	}
	lines.push(`  Duration: ${formatDuration(durationMs)}`);

	lines.push("");
	lines.push("Timing");
	lines.push(
		`  Avg generation:    ${formatDuration(stats.timing.avgGenerationMs)}`,
	);
	const avgScoringForDisplay =
		stats.timing.avgScoringOnlyMs ?? stats.timing.avgScoringMs;
	if (avgScoringForDisplay !== null) {
		lines.push(`  Avg scoring:       ${formatDuration(avgScoringForDisplay)}`);
	}
	if (stats.timing.avgRetryGenerationMs != null) {
		lines.push(
			`  Avg retry gen:     ${formatDuration(stats.timing.avgRetryGenerationMs)} (${stats.timing.scoringItemsWithRetry ?? 0} items)`,
		);
	}
	if (
		stats.timing.avgScoringMs !== null &&
		stats.timing.avgScoringOnlyMs !== undefined &&
		stats.timing.avgScoringOnlyMs !== null &&
		stats.timing.avgScoringMs > stats.timing.avgScoringOnlyMs
	) {
		lines.push(
			`  Avg scoring total: ${formatDuration(stats.timing.avgScoringMs)}`,
		);
	}
	if (stats.timing.avgFrontierEvalMs !== null) {
		lines.push(
			`  Avg frontier eval: ${formatDuration(stats.timing.avgFrontierEvalMs)}`,
		);
	}
	lines.push(
		`  Generation range:  ${formatDuration(stats.timing.minGenerationMs)} - ${formatDuration(stats.timing.maxGenerationMs)}`,
	);

	if (stats.tokens) {
		lines.push("");
		lines.push("Tokens");
		lines.push(
			`  Total prompt:      ${formatNumber(stats.tokens.totalPromptTokens)}`,
		);
		lines.push(
			`  Total completion:  ${formatNumber(stats.tokens.totalCompletionTokens)}`,
		);
		lines.push(
			`  Avg completion:    ${formatNumber(stats.tokens.avgCompletionTokens)}/item`,
		);
		lines.push(`  Items with tokens: ${stats.tokens.itemsWithTokens}/${total}`);
	}

	if (stats.scoring) {
		lines.push("");
		lines.push("Scoring");
		lines.push(
			`  Semantic pass rate: ${stats.scoring.passRate.toFixed(1)}% (${stats.scoring.totalPassed}/${stats.scoring.totalTests} scored checks)`,
		);
		lines.push(
			`  Item success rate:  ${stats.scoring.itemSuccessRate.toFixed(1)}% (${stats.scoring.completedItems}/${stats.scoring.totalItems} items)`,
		);
		lines.push(
			`  Scored rows:        ${stats.scoring.scoredItemRate.toFixed(1)}% (${stats.scoring.scoredItems}/${stats.scoring.totalItems} items)`,
		);
		if (stats.signal) {
			if (stats.trustedScoring) {
				lines.push(
					`  Trusted semantic:   ${stats.trustedScoring.passRate.toFixed(1)}% (${stats.trustedScoring.totalPassed}/${stats.trustedScoring.totalTests} scored checks)`,
				);
				lines.push(
					`  Trusted items:      ${stats.trustedScoring.itemSuccessRate.toFixed(1)}% (${stats.trustedScoring.completedItems}/${stats.trustedScoring.totalItems} items)`,
				);
				lines.push(
					`  Trusted rows:       ${stats.trustedScoring.scoredItemRate.toFixed(1)}% (${stats.trustedScoring.scoredItems}/${stats.trustedScoring.totalItems} items)`,
				);
			} else {
				lines.push(
					"  Trusted semantic:   unavailable (no trustworthy scored rows)",
				);
			}
		} else {
			lines.push(
				"  Trusted semantic:   unavailable (signalAssessment missing)",
			);
		}

		if (stats.scoring.byTest.length > 1) {
			lines.push("  By test:");
			const maxNameLen = Math.max(
				...stats.scoring.byTest.map((t) => t.name.length),
			);
			for (const t of stats.scoring.byTest) {
				lines.push(
					`    ${pad(t.name, maxNameLen)}  ${pad(`${t.passRate.toFixed(1)}%`, 6, "right")} (${t.passed}/${t.total})`,
				);
			}
		}

		if (stats.scoring.byHarness.length > 1) {
			lines.push("  By harness:");
			const maxNameLen = Math.max(
				...stats.scoring.byHarness.map((h) => h.name.length),
			);
			for (const h of stats.scoring.byHarness) {
				lines.push(
					`    ${pad(h.name, maxNameLen)}  ${pad(`${h.passRate.toFixed(1)}%`, 6, "right")} (${h.passed}/${h.total})`,
				);
			}
		}

		if (stats.scoring.byModel.length > 1) {
			lines.push("  By model:");
			const maxNameLen = Math.min(
				25,
				Math.max(...stats.scoring.byModel.map((m) => m.name.length)),
			);
			for (const m of stats.scoring.byModel) {
				const displayName =
					m.name.length > 25 ? `${m.name.slice(0, 24)}…` : m.name;
				lines.push(
					`    ${pad(displayName, maxNameLen)}  ${pad(`${m.passRate.toFixed(1)}%`, 6, "right")} (${m.passed}/${m.total})`,
				);
			}
		}
	}

	if (stats.frontier) {
		lines.push("");
		lines.push("Frontier Eval");
		lines.push(
			`  Avg score: ${stats.frontier.avgScore.toFixed(1)}/10 (${stats.frontier.itemCount} items)`,
		);
		lines.push(
			`  Range: ${stats.frontier.minScore}/10 - ${stats.frontier.maxScore}/10`,
		);
		if (stats.signal) {
			if (stats.trustedFrontier) {
				lines.push(
					`  Trusted avg: ${stats.trustedFrontier.avgScore.toFixed(1)}/10 (${stats.trustedFrontier.itemCount} items)`,
				);
			} else {
				lines.push("  Trusted avg: unavailable (no trustworthy eval rows)");
			}
		} else {
			lines.push("  Trusted avg: unavailable (signalAssessment missing)");
		}

		if (stats.frontier.byHarness.length > 1) {
			lines.push("  By harness:");
			const maxNameLen = Math.max(
				...stats.frontier.byHarness.map((h) => h.name.length),
			);
			for (const h of stats.frontier.byHarness) {
				lines.push(
					`    ${pad(h.name, maxNameLen)}  ${h.avgScore.toFixed(1)}/10 (${h.count})`,
				);
			}
		}

		if (stats.frontier.byModel.length > 1) {
			lines.push("  By model:");
			const maxNameLen = Math.min(
				25,
				Math.max(...stats.frontier.byModel.map((m) => m.name.length)),
			);
			for (const m of stats.frontier.byModel) {
				const displayName =
					m.name.length > 25 ? `${m.name.slice(0, 24)}…` : m.name;
				lines.push(
					`    ${pad(displayName, maxNameLen)}  ${m.avgScore.toFixed(1)}/10 (${m.count})`,
				);
			}
		}
	}

	if (stats.signal) {
		lines.push("");
		lines.push("Signal");
		lines.push(
			`  Tainted rows: ${stats.signal.taintedItems}/${stats.signal.totalItems}`,
		);
		lines.push(
			`  Trusted rows: ${stats.signal.trustedItems}/${stats.signal.totalItems}`,
		);
		if (stats.signal.byHarness.length > 0) {
			lines.push("  Tainted by harness:");
			const maxNameLen = Math.max(
				...stats.signal.byHarness.map((entry) => entry.name.length),
			);
			for (const entry of stats.signal.byHarness) {
				lines.push(`    ${pad(entry.name, maxNameLen)}  ${entry.count}`);
			}
		}
	}

	lines.push("");
	lines.push(`Results: ${outputDir}/${runId}/`);
	lines.push("");

	return lines.join("\n");
}
