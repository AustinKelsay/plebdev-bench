/**
 * Purpose: Execute a single matrix item (one model/harness/test/passType combination).
 * Exports: executeItem
 *
 * Execution flow:
 * 1. Load prompt from src/tests/<test>/prompt.<passType>.md
 * 2. Create harness adapter and generate completion
 * 3. Record result (success/failure, duration, output)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MatrixItem, MatrixItemResult, GenerationResult } from "../schemas/index.js";
import { createHarness, type HarnessName } from "../harnesses/index.js";
import { logger } from "../lib/logger.js";

/**
 * Loads a prompt file from the test directory.
 *
 * @param test - Test slug (directory name)
 * @param passType - 'blind' or 'informed'
 * @returns Prompt content
 *
 * @throws {Error} If prompt file not found
 */
function loadPrompt(test: string, passType: string): string {
	const promptPath = path.join(
		process.cwd(),
		"src",
		"tests",
		test,
		`prompt.${passType}.md`,
	);

	if (!fs.existsSync(promptPath)) {
		throw new Error(`Prompt file not found: ${promptPath}`);
	}

	return fs.readFileSync(promptPath, "utf-8");
}

/**
 * Executes a single matrix item.
 *
 * @param item - The matrix item to execute
 * @param ollamaBaseUrl - Ollama API base URL (used by all harnesses)
 * @param timeoutMs - Generation timeout in milliseconds
 * @param unloadAfter - If true, unload model after generation (Ollama-specific)
 * @returns The execution result
 *
 * Note: This function does NOT throw on generation failures.
 * Instead, failures are recorded in the result.
 */
export async function executeItem(
	item: MatrixItem,
	ollamaBaseUrl: string,
	timeoutMs: number,
	unloadAfter = true,
): Promise<MatrixItemResult> {
	const log = logger.child({
		itemId: item.id,
		model: item.model,
		harness: item.harness,
		test: item.test,
		passType: item.passType,
	});

	const startedAt = new Date().toISOString();

	let generation: GenerationResult;

	try {
		// Load prompt
		log.debug("Loading prompt...");
		const prompt = loadPrompt(item.test, item.passType);

		// Create harness adapter and generate
		log.debug({ harness: item.harness }, "Creating harness and generating...");
		const harness = createHarness(item.harness as HarnessName, {
			ollamaBaseUrl,
			defaultTimeoutMs: timeoutMs,
		});

		const result = await harness.generate({
			model: item.model,
			prompt,
			timeoutMs,
			unloadAfter,
		});

		generation = {
			success: true,
			output: result.output,
			durationMs: result.durationMs,
			promptTokens: result.promptTokens,
			completionTokens: result.completionTokens,
		};

		log.info({ durationMs: result.durationMs, harness: item.harness }, "Generation completed");
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		generation = {
			success: false,
			error: errorMessage,
			durationMs: 0, // Duration tracked by harness, but we failed before getting it
		};

		log.warn({ error: errorMessage, harness: item.harness }, "Generation failed");
	}

	const completedAt = new Date().toISOString();

	return {
		id: item.id,
		model: item.model,
		harness: item.harness,
		test: item.test,
		passType: item.passType,
		status: generation.success ? "completed" : "failed",
		startedAt,
		completedAt,
		generation,
	};
}
