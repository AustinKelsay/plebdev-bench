#!/usr/bin/env bun
/**
 * Purpose: Build index.json for the dashboard by scanning results directory.
 * Generates a list of all runs with summary information.
 *
 * Usage: bun run apps/dashboard/scripts/build-index.ts
 */
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

interface RunListItem {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
}

const RESULTS_DIR = join(import.meta.dir, "../../../results");
const INDEX_PATH = join(RESULTS_DIR, "index.json");

async function buildIndex(): Promise<void> {
  console.log(`Scanning ${RESULTS_DIR} for runs...`);

  const runs: RunListItem[] = [];

  try {
    const entries = await readdir(RESULTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const runDir = join(RESULTS_DIR, entry.name);
      const runJsonPath = join(runDir, "run.json");

      try {
        const content = await readFile(runJsonPath, "utf-8");
        const run = JSON.parse(content);

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
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    // Write index.json
    await writeFile(INDEX_PATH, JSON.stringify(runs, null, 2));

    console.log(`\nWrote ${runs.length} runs to ${INDEX_PATH}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`Results directory not found: ${RESULTS_DIR}`);
      console.log("Run some benchmarks first with: bun pb");

      // Create empty index
      await writeFile(INDEX_PATH, "[]");
      console.log(`Created empty index at ${INDEX_PATH}`);
    } else {
      throw error;
    }
  }
}

buildIndex().catch(console.error);
