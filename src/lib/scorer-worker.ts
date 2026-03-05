/**
 * Purpose: Worker entrypoint for isolated scoring in a short-lived Bun process.
 * Exports: none (CLI worker)
 *
 * Protocol:
 * - Reads JSON request from stdin
 * - Writes JSON response to stdout
 * - Never logs to stdout to keep protocol deterministic
 */

import { z } from "zod";
import { ScoringResultSchema } from "../schemas/index.js";
import { scoreGenerationInProcess } from "./scorer-core.js";

/** Worker request payload schema. */
const ScorerWorkerRequestSchema = z.object({
	testSlug: z.string().min(1),
	rawOutput: z.string(),
	timeoutMs: z.number().int().positive(),
	codeFilePath: z.string().optional(),
});

/** Worker response payload schema. */
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

/**
 * Reads stdin as UTF-8 string.
 *
 * @returns Full stdin payload
 */
async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Writes one JSON response line to stdout.
 *
 * @param payload - Structured worker response
 */
function writeResponse(
	payload: z.infer<typeof ScorerWorkerResponseSchema>,
): void {
	const validated = ScorerWorkerResponseSchema.parse(payload);
	process.stdout.write(JSON.stringify(validated));
}

/**
 * Main worker routine.
 */
async function main(): Promise<void> {
	try {
		const inputRaw = await readStdin();
		const request = ScorerWorkerRequestSchema.parse(JSON.parse(inputRaw));
		const result = await scoreGenerationInProcess(
			request.testSlug,
			request.rawOutput,
			request.timeoutMs,
			request.codeFilePath,
		);
		writeResponse({ ok: true, result });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		try {
			writeResponse({ ok: false, error: errorMessage });
		} catch (writeError) {
			process.stderr.write(
				`scorer-worker: failed to write error response: ${writeError instanceof Error ? writeError.message : String(writeError)}\n`,
			);
			process.stderr.write(`original error: ${errorMessage}\n`);
		}
		process.exitCode = 1;
	}
}

void main();
