#!/usr/bin/env bun
/**
 * Purpose: Build index.json for the dashboard by scanning results directory.
 * Generates a list of all runs with summary information.
 *
 * Usage:
 *   bun run apps/dashboard/scripts/build-index.ts
 *   bun run apps/dashboard/scripts/build-index.ts --dir results
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RunResultSchema } from "../src/lib/schemas";
import type { RunListItem } from "../src/lib/types";

const DEFAULT_RESULTS_DIR = resolve(import.meta.dir, "../public/results");

/**
 * Resolves the results directory to scan.
 *
 * Rules:
 * - Default: apps/dashboard/public/results
 * - Optional: `--dir <path>` resolved from process cwd
 *
 * @throws Error if `--dir` is provided without a path
 */
function resolveResultsDir(argv: string[]): string {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log("Usage: bun run apps/dashboard/scripts/build-index.ts [--dir <path>]");
		console.log("");
		console.log("Default directory: apps/dashboard/public/results");
		process.exit(0);
	}

	const dirFlagIndex = argv.indexOf("--dir");
	if (dirFlagIndex === -1) return DEFAULT_RESULTS_DIR;

	const dirArg = argv.at(dirFlagIndex + 1);
	if (typeof dirArg !== "string" || dirArg.trim().length === 0) {
		throw new Error("--dir requires a path");
	}

	return resolve(process.cwd(), dirArg);
}

async function buildIndex(): Promise<void> {
	const resultsDir = resolveResultsDir(process.argv.slice(2));
	const indexPath = join(resultsDir, "index.json");

	console.log(`Scanning ${resultsDir} for runs...`);

	const runs: RunListItem[] = [];

	try {
		// Ensure directory exists so first-time setups succeed deterministically.
		await mkdir(resultsDir, { recursive: true });

		const entries = await readdir(resultsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const runDir = join(resultsDir, entry.name);
			const runJsonPath = join(runDir, "run.json");

			try {
				const content = await readFile(runJsonPath, "utf-8");
				const parsedJson = JSON.parse(content) as unknown;
				const parsedRun = RunResultSchema.safeParse(parsedJson);
				if (!parsedRun.success) {
					console.log(`  Skipped: ${entry.name} (invalid run.json schema)`);
					continue;
				}
				const run = parsedRun.data;

				runs.push({
					runId: run.runId,
					startedAt: run.startedAt,
					completedAt: run.completedAt,
					durationMs: run.durationMs,
					summary: run.summary,
				});

				console.log(`  Found: ${run.runId}`);
			} catch {
				// Skip directories without valid run.json
				console.log(`  Skipped: ${entry.name} (no valid run.json)`);
			}
		}

		// Sort by startedAt descending (newest first)
		runs.sort(
			(a, b) =>
				new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
		);

		// Write index.json
		await writeFile(indexPath, JSON.stringify(runs, null, 2));

		console.log(`\nWrote ${runs.length} runs to ${indexPath}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			// Should be rare (we mkdir -p), but keep deterministic behavior.
			console.log("Results directory not found; creating empty index.");
			await mkdir(resultsDir, { recursive: true });
			await writeFile(indexPath, "[]");
			console.log(`Created empty index at ${indexPath}`);
		} else {
			throw error;
		}
	}
}

buildIndex().catch(console.error);
