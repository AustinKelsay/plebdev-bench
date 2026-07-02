/**
 * Purpose: Verify the tracked Hermes smoke artifact remains publishable.
 * Exports: none
 *
 * Invariants:
 * - The published artifact is a combined code-output + workspace Hermes run.
 * - Dashboard index artifacts preserve Hermes coordinates for the run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const PUBLISHED_HERMES_RUN_ID = "20260619-075023-35fca1";

function readJson<T>(relativePath: string): T {
	return JSON.parse(
		fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8"),
	) as T;
}

describe("published Hermes artifact", () => {
	it("documents the combined-run decision and exact publication command", () => {
		const doc = fs.readFileSync(
			path.join(
				process.cwd(),
				"llm",
				"implementation",
				"hermes-published-smoke-artifact.md",
			),
			"utf-8",
		);

		expect(doc).toContain("Publish one combined Hermes smoke run");
		expect(doc).toContain(PUBLISHED_HERMES_RUN_ID);
		expect(doc).toContain("env OPENROUTER_API_KEY= bun run src/index.ts run");
		expect(doc).toContain("--harnesses hermes");
		expect(doc).toContain("--tests smoke workspace-tool-smoke");
		expect(doc).toContain("--machine-instance-id hermes-post-merge-m4-pro");
	});

	it("publishes Hermes run, plan, index, and checkpoint aggregate coordinates", () => {
		const run = readJson<{
			benchmarkCheckpoint?: { checkpointId: string };
			summary: { total: number; completed: number; failed: number };
			items: Array<{
				harness: string;
				runtime: string;
				model: string;
				test: string;
				passType: string;
				status: string;
				automatedScore?: { passed: number; failed: number; total: number };
			}>;
		}>(`apps/dashboard/public/results/${PUBLISHED_HERMES_RUN_ID}/run.json`);
		const plan = readJson<{
			items: Array<{ harness: string; test: string; scoringMode: string }>;
		}>(`apps/dashboard/public/results/${PUBLISHED_HERMES_RUN_ID}/plan.json`);
		const index = readJson<{
			runs: Array<{
				runId: string;
				summary: { total: number; completed: number };
			}>;
		}>("apps/dashboard/public/results/index.json");
		const checkpointId = run.benchmarkCheckpoint?.checkpointId;
		expect(checkpointId).toBeDefined();
		const aggregate = readJson<{
			items: Array<{
				sourceRunId: string;
				harness: string;
				runtime: string;
				model: string;
				test: string;
				passType: string;
			}>;
		}>(`apps/dashboard/public/results/aggregates/${checkpointId}.json`);

		expect(run.summary).toMatchObject({ total: 2, completed: 2, failed: 0 });
		expect(
			run.items.map((item) => ({
				harness: item.harness,
				test: item.test,
				status: item.status,
				score: item.automatedScore,
			})),
		).toEqual([
			{
				harness: "hermes",
				test: "workspace-tool-smoke",
				status: "completed",
				score: { passed: 7, failed: 0, total: 7 },
			},
			{
				harness: "hermes",
				test: "smoke",
				status: "completed",
				score: { passed: 6, failed: 0, total: 6 },
			},
		]);
		expect(
			plan.items.map((item) => [item.harness, item.test, item.scoringMode]),
		).toEqual([
			["hermes", "workspace-tool-smoke", "workspace"],
			["hermes", "smoke", "code-module"],
		]);
		expect(
			index.runs.find((runEntry) => runEntry.runId === PUBLISHED_HERMES_RUN_ID)
				?.summary,
		).toMatchObject({ total: 2, completed: 2 });
		expect(
			aggregate.items
				.filter((item) => item.sourceRunId === PUBLISHED_HERMES_RUN_ID)
				.map((item) => [item.harness, item.runtime, item.model, item.test]),
		).toEqual([
			["hermes", "ollama", "qwen3.6:35b", "smoke"],
			["hermes", "ollama", "qwen3.6:35b", "workspace-tool-smoke"],
		]);
	});
});
