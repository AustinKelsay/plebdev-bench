/**
 * Purpose: Stable scoring entrypoint that isolates scoring in a short-lived subprocess.
 * Exports: scoreGeneration
 *
 * Why process isolation:
 * - Bun can retain memory for repeated dynamic ESM imports in long-lived processes.
 * - Spawning a scorer subprocess bounds module-cache growth per matrix item.
 *
 * Use `PLEBDEV_BENCH_SCORER_MODE=in-process` to disable subprocess isolation.
 */

import * as path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { type ScoringResult, ScoringResultSchema } from "../schemas/index.js";
import { scoreGenerationInProcess } from "./scorer-core.js";

/** Scoring execution mode. */
const ScorerModeSchema = z.enum(["process", "in-process"]);

/** Worker request payload. */
const ScorerWorkerRequestSchema = z.object({
	testSlug: z.string().min(1),
	rawOutput: z.string(),
	timeoutMs: z.number().int().positive(),
	codeFilePath: z.string().optional(),
});

/** Worker response payload. */
const ScorerWorkerResponseSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		result: ScoringResultSchema,
	}),
	z.object({
		ok: z.literal(false),
		error: z.string().min(1),
	}),
]);

/** Additional timeout budget for worker startup and JSON I/O. */
const SCORER_WORKER_OVERHEAD_MS = 2000;

/**
 * Resolves scoring mode from environment.
 *
 * @returns Selected scoring mode
 * @throws {Error} If env value is invalid
 */
function resolveScoringMode(): z.infer<typeof ScorerModeSchema> {
	const rawMode = process.env.PLEBDEV_BENCH_SCORER_MODE ?? "process";
	return ScorerModeSchema.parse(rawMode);
}

/**
 * Runs scoring inside a dedicated Bun subprocess.
 *
 * @param input - Worker input payload
 * @returns Parsed scoring result
 * @throws {Error} If worker fails or response is invalid
 */
async function scoreInWorker(
	input: z.infer<typeof ScorerWorkerRequestSchema>,
): Promise<ScoringResult> {
	const workerPath = path.join(process.cwd(), "src", "lib", "scorer-worker.ts");
	const child = await execa("bun", [workerPath], {
		input: JSON.stringify(input),
		timeout: input.timeoutMs + SCORER_WORKER_OVERHEAD_MS,
		reject: true,
		env: {
			...process.env,
			LOG_LEVEL: "silent",
		},
	});

	const parsedResponse = ScorerWorkerResponseSchema.parse(
		JSON.parse(child.stdout),
	);

	if (!parsedResponse.ok) {
		throw new Error(parsedResponse.error);
	}

	return parsedResponse.result;
}

/**
 * Scores generated code against a test's scoring spec.
 *
 * Default mode isolates scoring into a subprocess to prevent memory growth
 * from repeated dynamic imports during long benchmark runs.
 *
 * @param testSlug - Test directory name
 * @param rawOutput - Raw output from LLM generation
 * @param timeoutMs - Timeout for scoring (default: 5s)
 * @param codeFilePath - Optional path to code file written by tool-calling harness
 * @returns Scoring result with pass/fail counts
 */
export async function scoreGeneration(
	testSlug: string,
	rawOutput: string,
	timeoutMs = 5000,
	codeFilePath?: string,
): Promise<ScoringResult> {
	const input = ScorerWorkerRequestSchema.parse({
		testSlug,
		rawOutput,
		timeoutMs,
		codeFilePath,
	});

	const mode = resolveScoringMode();
	if (mode === "in-process") {
		return scoreGenerationInProcess(
			input.testSlug,
			input.rawOutput,
			input.timeoutMs,
			input.codeFilePath,
		);
	}

	return scoreInWorker(input);
}
