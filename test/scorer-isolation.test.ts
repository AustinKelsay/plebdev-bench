/**
 * Purpose: Validate scorer isolation behavior and mode selection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execaMock = vi.fn();

vi.mock("execa", () => ({
	execa: execaMock,
}));

const ORIGINAL_ENV = process.env.PLEBDEV_BENCH_SCORER_MODE;

beforeEach(() => {
	execaMock.mockReset();
	Reflect.deleteProperty(process.env, "PLEBDEV_BENCH_SCORER_MODE");
});

afterEach(() => {
	if (ORIGINAL_ENV === undefined) {
		Reflect.deleteProperty(process.env, "PLEBDEV_BENCH_SCORER_MODE");
	} else {
		process.env.PLEBDEV_BENCH_SCORER_MODE = ORIGINAL_ENV;
	}
});

describe("scoreGeneration isolation", () => {
	it("uses worker mode by default", async () => {
		execaMock.mockResolvedValue({
			stdout: JSON.stringify({
				ok: true,
				result: {
					passed: 1,
					failed: 0,
					total: 1,
				},
			}),
		});

		const { scoreGeneration } = await import("../src/lib/scorer.js");
		const result = await scoreGeneration("smoke", "export const x = 1;");

		expect(execaMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ passed: 1, failed: 0, total: 1 });
	});

	it("supports in-process mode for debugging", async () => {
		process.env.PLEBDEV_BENCH_SCORER_MODE = "in-process";
		const { scoreGeneration } = await import("../src/lib/scorer.js");

		const result = await scoreGeneration(
			"__missing_scoring_spec__",
			"export const x = 1;",
		);

		expect(execaMock).not.toHaveBeenCalled();
		expect(result.failureType).toBe("no_spec");
	});

	it("throws on invalid scorer mode", async () => {
		process.env.PLEBDEV_BENCH_SCORER_MODE = "broken-mode";
		const { scoreGeneration } = await import("../src/lib/scorer.js");

		await expect(
			scoreGeneration("smoke", "export const x = 1;"),
		).rejects.toThrow();
	});
});
