/**
 * Purpose: Runtime model availability summaries for plan-builder error messages.
 * Exports: listAvailableModelsByRuntime
 *
 * Invariants:
 * - Summaries are diagnostic only and do not affect model selection.
 * - Runtime construction uses the same config fields as plan discovery.
 */

import { type RuntimeName, createRuntime } from "../runtimes/index.js";
import type { BenchConfig } from "../schemas/index.js";

/**
 * Lists available runtime models for actionable model-selection errors.
 *
 * @param runtimes - Runtime names to inspect
 * @param config - Benchmark config containing runtime connection details
 * @returns Human-readable per-runtime model summaries
 * @throws {Error} If runtime construction fails before a diagnostic probe can run
 */
export async function listAvailableModelsByRuntime(
	runtimes: RuntimeName[],
	config: BenchConfig,
): Promise<string[]> {
	const availableByRuntime: string[] = [];
	for (const runtimeName of runtimes) {
		const runtime = createRuntime(runtimeName, {
			ollamaBaseUrl: config.ollamaBaseUrl,
			defaultTimeoutMs: config.generateTimeoutMs,
		});
		let available: string[];
		try {
			available = await runtime.listModels();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			availableByRuntime.push(`${runtimeName}: probe failed (${message})`);
			continue;
		}
		availableByRuntime.push(
			available.length === 0
				? `${runtimeName}: (no models installed)`
				: `${runtimeName}: ${available.slice(0, 5).join(", ")}${available.length > 5 ? ` (+${available.length - 5} more)` : ""}`,
		);
	}
	return availableByRuntime;
}
