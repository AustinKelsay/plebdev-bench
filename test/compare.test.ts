/**
 * Purpose: Ensure compare output is deterministic regardless of input order.
 */

import { describe, expect, it } from "vitest";
import { compareRuns } from "../src/results/compare.js";
import type { MatrixItemResult, RunResult } from "../src/schemas/index.js";
import { SCHEMA_VERSION } from "../src/schemas/index.js";

function buildRun(runId: string, items: MatrixItemResult[]): RunResult {
	const completed = items.filter((item) => item.status === "completed").length;
	const failed = items.filter((item) => item.status === "failed").length;

	return {
		schemaVersion: SCHEMA_VERSION,
		runId,
		startedAt: "2026-01-14T14:30:52.000Z",
		completedAt: "2026-01-14T14:40:52.000Z",
		durationMs: 600_000,
		summary: {
			total: items.length,
			completed,
			failed,
			pending: 0,
		},
		items,
	};
}

function buildItem(
	id: string,
	test: string,
	passType: "blind" | "informed",
	durationMs: number,
): MatrixItemResult {
	return {
		id,
		model: "llama3.2:3b",
		harness: "ollama",
		test,
		passType,
		status: "completed",
		generation: {
			success: true,
			output: "code here",
			durationMs,
		},
	};
}

describe("compareRuns", () => {
	it("should return deterministic ordering for matched and exclusive items", () => {
		const itemBlind = buildItem("01", "smoke", "blind", 1000);
		const itemInformed = buildItem("02", "smoke", "informed", 1200);
		const itemOnlyInA = buildItem("03", "todo-app", "blind", 1500);
		const itemOnlyInB = buildItem("04", "calculator-basic", "blind", 900);

		const runA = buildRun("run-a", [itemInformed, itemOnlyInA, itemBlind]);
		const runB = buildRun("run-b", [itemOnlyInB, itemBlind, itemInformed]);

		const comparison1 = compareRuns(runA, runB);
		const comparison2 = compareRuns(buildRun("run-a", [itemBlind, itemOnlyInA, itemInformed]), runB);

		const matchedKeys = comparison1.matched.map((m) => m.key);
		expect(matchedKeys).toEqual([
			"llama3.2:3b|ollama|smoke|blind",
			"llama3.2:3b|ollama|smoke|informed",
		]);

		const onlyInAKeys = comparison1.onlyInA.map((item) =>
			`${item.model}|${item.harness}|${item.test}|${item.passType}`,
		);
		const onlyInBKeys = comparison1.onlyInB.map((item) =>
			`${item.model}|${item.harness}|${item.test}|${item.passType}`,
		);

		expect(onlyInAKeys).toEqual(["llama3.2:3b|ollama|todo-app|blind"]);
		expect(onlyInBKeys).toEqual(["llama3.2:3b|ollama|calculator-basic|blind"]);
		expect(comparison2.matched.map((m) => m.key)).toEqual(matchedKeys);
		expect(comparison2.onlyInA.map((item) => item.test)).toEqual(["todo-app"]);
	});
});
