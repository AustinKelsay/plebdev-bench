/**
 * Purpose: Execute a single matrix item (one model/harness/test/passType combination).
 * Exports: executeItem
 *
 * Execution flow:
 * 1. Load prompt from src/tests/<test>/prompt.<passType>.md
 * 2. Create harness adapter and generate completion
 * 3. Run automated scoring against generated code
 * 4. Record result (success/failure, duration, output, scores)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MatrixItem, MatrixItemResult, GenerationResult, AutomatedScore, FrontierEval, ScoringMetrics } from "../schemas/index.js";
import { createHarness, type HarnessName } from "../harnesses/index.js";
import { logger } from "../lib/logger.js";
import { scoreGeneration } from "../lib/scorer.js";
import { extractCode } from "../lib/code-extractor.js";
import { loadRubric } from "../lib/scoring-spec.js";
import { evaluateWithFrontier, getOpenRouterKey } from "../lib/openrouter-client.js";
import { classifyGenerationError } from "../lib/failure-classifier.js";

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
		const failureType = classifyGenerationError(errorMessage);

		generation = {
			success: false,
			error: errorMessage,
			failureType,
			durationMs: 0, // Duration tracked by harness, but we failed before getting it
		};

		log.warn({ error: errorMessage, failureType, harness: item.harness }, "Generation failed");
	}

	// Run automated scoring if generation succeeded
	let automatedScore: AutomatedScore | undefined;
	let scoringMetrics: ScoringMetrics | undefined;
	if (generation.success && generation.output) {
		try {
			log.debug("Running automated scoring...");
			const scoringStartTime = performance.now();
			const scoringResult = await scoreGeneration(item.test, generation.output);
			const scoringDurationMs = Math.round(performance.now() - scoringStartTime);

			automatedScore = {
				passed: scoringResult.passed,
				failed: scoringResult.failed,
				total: scoringResult.total,
			};

			scoringMetrics = {
				durationMs: scoringDurationMs,
			};

			log.info(
				{ passed: scoringResult.passed, total: scoringResult.total, durationMs: scoringDurationMs },
				"Scoring completed",
			);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.warn({ error: errorMessage }, "Scoring failed");
			// Don't fail the item, just record no score
		}
	}

	// Run frontier eval if API key is present and generation succeeded
	let frontierEval: FrontierEval | undefined;
	const openRouterKey = getOpenRouterKey();
	if (openRouterKey && generation.success && generation.output) {
		const rubric = loadRubric(item.test);
		if (rubric) {
			try {
				log.debug("Running frontier eval...");
				const extracted = extractCode(generation.output);

				const evalResult = await evaluateWithFrontier(
					{
						code: extracted.code,
						rubric,
						testSlug: item.test,
					},
					openRouterKey,
				);

				if (evalResult) {
					frontierEval = {
						score: evalResult.score,
						reasoning: evalResult.reasoning,
						model: evalResult.model,
						latencyMs: evalResult.latencyMs,
					};
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				log.warn({ error: errorMessage }, "Frontier eval failed");
				// Don't fail the item, just record no eval
			}
		} else {
			log.debug("No rubric found, skipping frontier eval");
		}
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
		automatedScore,
		scoringMetrics,
		frontierEval,
	};
}
