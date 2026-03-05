/**
 * Purpose: Execute a single matrix item (one runtime/harness/model/test/passType combination).
 * Exports: executeItem
 *
 * Execution flow:
 * 1. Load prompt from src/tests/<test>/prompt.<passType>.md
 * 2. Create runtime and harness adapter
 * 3. Generate completion (passing runtime to harness)
 * 4. Run automated scoring against generated code
 * 5. Record result (success/failure, duration, output, scores)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHarness } from "../harnesses/index.js";
import { extractCode } from "../lib/code-extractor.js";
import {
	classifyGenerationError,
	classifyScoringError,
} from "../lib/failure-classifier.js";
import { logger } from "../lib/logger.js";
import {
	evaluateWithFrontier,
	getOpenRouterKey,
} from "../lib/openrouter-client.js";
import { scoreGeneration } from "../lib/scorer.js";
import { loadRubric } from "../lib/scoring-spec.js";
import { createRuntime } from "../runtimes/index.js";
import type {
	AutomatedScore,
	FrontierEval,
	GenerationResult,
	MatrixItem,
	MatrixItemResult,
	ScoringMetrics,
	ScoringResult,
} from "../schemas/index.js";

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

/** Runtime configuration for creating runtime instances. */
interface RuntimeUrls {
	ollamaBaseUrl: string;
	vllmBaseUrl: string;
}

/** Max compile error length embedded in retry prompt. */
const COMPILE_RETRY_ERROR_MAX_LENGTH = 1200;

/**
 * Builds a retry prompt that includes compiler/import failure context.
 *
 * @param originalPrompt - Original test prompt
 * @param compileError - Import/build error from scoring
 * @returns Prompt instructing model to fix compile errors
 */
function buildCompileRetryPrompt(
	originalPrompt: string,
	compileError: string,
): string {
	const compactError = compileError.replace(/\s+/g, " ").trim();
	const clippedError = compactError.slice(0, COMPILE_RETRY_ERROR_MAX_LENGTH);
	return [
		originalPrompt.trim(),
		"",
		"Previous attempt failed to compile/import during scoring.",
		`Compiler/build error: ${clippedError}`,
		"Fix all compile/type/syntax issues while preserving required behavior.",
		"Return only final TypeScript source code.",
	].join("\n");
}

/** Context for compile-feedback retry generation/scoring. */
interface CompileRetryContext {
	item: MatrixItem;
	harness: ReturnType<typeof createHarness>;
	runtime: ReturnType<typeof createRuntime>;
	promptForRetry: string;
	timeoutMs: number;
	unloadAfter: boolean;
	log: {
		warn: (obj: Record<string, unknown>, msg?: string) => void;
	};
	currentGenerationDurationMs: number;
	compileError: string;
}

/**
 * Runs one compile-feedback retry attempt and returns retry generation+score on success.
 *
 * @param context - Retry context and dependencies
 * @returns Retry result or undefined if retry attempt fails
 */
async function runCompileFeedbackRetry(context: CompileRetryContext): Promise<
	| {
			generation: GenerationResult;
			scoringResult: ScoringResult;
			scoringDurationMs: number;
	  }
	| undefined
> {
	const retryPrompt = buildCompileRetryPrompt(
		context.promptForRetry,
		context.compileError,
	);
	const remainingTimeoutMs = Math.max(
		1000,
		context.timeoutMs - context.currentGenerationDurationMs,
	);
	context.log.warn(
		{
			harness: context.item.harness,
			test: context.item.test,
			passType: context.item.passType,
			remainingTimeoutMs,
			compileError: context.compileError.slice(0, 300),
		},
		"Compile/import failure detected, retrying generation once with compiler feedback",
	);

	try {
		const retryResult = await context.harness.generate({
			model: context.item.model,
			prompt: retryPrompt,
			timeoutMs: remainingTimeoutMs,
			unloadAfter: context.unloadAfter,
			runtime: context.runtime,
		});
		const retryGeneration: GenerationResult = {
			success: true,
			output: retryResult.output,
			durationMs: retryResult.durationMs,
			promptTokens: retryResult.promptTokens,
			completionTokens: retryResult.completionTokens,
			codeFilePath: retryResult.codeFilePath,
		};
		const retryScoringStartTime = performance.now();
		const retryScoringResult = await scoreGeneration(
			context.item.test,
			retryGeneration.output ?? "",
			undefined,
			retryGeneration.codeFilePath,
		);
		const retryScoringDurationMs = Math.round(
			performance.now() - retryScoringStartTime,
		);
		return {
			generation: retryGeneration,
			scoringResult: retryScoringResult,
			scoringDurationMs: retryScoringDurationMs,
		};
	} catch (retryError) {
		const retryMessage =
			retryError instanceof Error ? retryError.message : String(retryError);
		context.log.warn(
			{
				harness: context.item.harness,
				test: context.item.test,
				passType: context.item.passType,
				error: retryMessage,
			},
			"Compile-feedback retry generation failed; keeping original attempt",
		);
		return undefined;
	}
}

/**
 * Executes a single matrix item.
 *
 * @param item - The matrix item to execute
 * @param runtimeConfig - Runtime URLs for creating runtime instances
 * @param timeoutMs - Generation timeout in milliseconds
 * @param unloadAfter - If true, unload model after generation (Ollama-specific)
 * @returns The execution result
 *
 * Note: This function does NOT throw on generation failures.
 * Instead, failures are recorded in the result.
 */
export async function executeItem(
	item: MatrixItem,
	runtimeConfig: RuntimeUrls,
	timeoutMs: number,
	unloadAfter = true,
): Promise<MatrixItemResult> {
	const log = logger.child({
		itemId: item.id,
		runtime: item.runtime,
		model: item.model,
		harness: item.harness,
		test: item.test,
		category: item.category,
		passType: item.passType,
	});

	const startedAt = new Date().toISOString();

	let generation: GenerationResult;
	let generationFailure: MatrixItemResult["generationFailure"];
	let generationStartTime: number | undefined;
	let promptForRetry = "";
	let runtimeForRetry: ReturnType<typeof createRuntime> | undefined;
	let harnessForRetry: ReturnType<typeof createHarness> | undefined;

	try {
		// Load prompt
		log.debug("Loading prompt...");
		const prompt = loadPrompt(item.test, item.passType);
		promptForRetry = prompt;

		// Create runtime instance
		const runtime = createRuntime(item.runtime, {
			ollamaBaseUrl: runtimeConfig.ollamaBaseUrl,
			vllmBaseUrl: runtimeConfig.vllmBaseUrl,
			defaultTimeoutMs: timeoutMs,
		});
		runtimeForRetry = runtime;

		// Create harness adapter
		log.debug({ harness: item.harness }, "Creating harness...");
		const harness = createHarness(item.harness);
		harnessForRetry = harness;

		// Generate completion (pass runtime to harness)
		generationStartTime = performance.now();
		const result = await harness.generate({
			model: item.model,
			prompt,
			timeoutMs,
			unloadAfter,
			runtime,
		});

		generation = {
			success: true,
			output: result.output,
			durationMs: result.durationMs,
			promptTokens: result.promptTokens,
			completionTokens: result.completionTokens,
			codeFilePath: result.codeFilePath,
		};

		log.info(
			{
				durationMs: result.durationMs,
				harness: item.harness,
				codeFilePath: result.codeFilePath,
			},
			"Generation completed",
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorDetails = error as {
			output?: string;
			durationMs?: number;
		};
		const failureType = classifyGenerationError(errorMessage);
		const fallbackDurationMs =
			typeof generationStartTime === "number"
				? Math.round(performance.now() - generationStartTime)
				: 0;
		const durationMs =
			typeof errorDetails.durationMs === "number"
				? errorDetails.durationMs
				: fallbackDurationMs;
		const output =
			typeof errorDetails.output === "string" &&
			errorDetails.output.trim().length > 0
				? errorDetails.output
				: undefined;

		generation = {
			success: false,
			error: errorMessage,
			failureType,
			durationMs,
			output,
		};

		generationFailure = {
			type: failureType,
			message: errorMessage,
		};

		log.warn(
			{ error: errorMessage, failureType, harness: item.harness },
			"Generation failed",
		);
	}

	// Run automated scoring for every successful generation.
	// This avoids denominator skew from "successful but empty" outputs.
	let automatedScore: AutomatedScore | undefined;
	let scoringMetrics: ScoringMetrics | undefined;
	let scoringFailure: MatrixItemResult["scoringFailure"];
	if (generation.success) {
		try {
			log.debug("Running automated scoring...");
			const scoringStartTime = performance.now();
			const supportsCompileRetry =
				item.harness === "goose" || item.harness === "opencode";
			let compileRetryUsed = false;
			let scoringResult: ScoringResult;
			let scoringOnlyDurationMs = 0;
			let retryGenerationDurationMs = 0;

			try {
				const initialScoringStartTime = performance.now();
				scoringResult = await scoreGeneration(
					item.test,
					generation.output ?? "", // empty string OK when codeFilePath is set
					undefined, // use default timeout
					generation.codeFilePath, // pass file path from tool-calling harness
				);
				scoringOnlyDurationMs += performance.now() - initialScoringStartTime;
			} catch (scoringError) {
				const scoringErrorMessage =
					scoringError instanceof Error
						? scoringError.message
						: String(scoringError);
				if (
					supportsCompileRetry &&
					harnessForRetry &&
					runtimeForRetry &&
					promptForRetry.length > 0
				) {
					const retryFromException = await runCompileFeedbackRetry({
						item,
						harness: harnessForRetry,
						runtime: runtimeForRetry,
						promptForRetry,
						timeoutMs,
						unloadAfter,
						log,
						currentGenerationDurationMs: generation.durationMs,
						compileError: scoringErrorMessage,
					});
					if (retryFromException) {
						compileRetryUsed = true;
						generation = retryFromException.generation;
						scoringResult = retryFromException.scoringResult;
						scoringOnlyDurationMs += retryFromException.scoringDurationMs;
						retryGenerationDurationMs +=
							retryFromException.generation.durationMs;
					} else {
						throw scoringError;
					}
				} else {
					throw scoringError;
				}
			}

			const compileError =
				scoringResult.failureType === "import" ||
				scoringResult.failureType === "missing_export"
					? scoringResult.error
					: undefined;
			if (
				!compileRetryUsed &&
				supportsCompileRetry &&
				typeof compileError === "string" &&
				harnessForRetry &&
				runtimeForRetry &&
				promptForRetry.length > 0
			) {
				const retryAttempt = await runCompileFeedbackRetry({
					item,
					harness: harnessForRetry,
					runtime: runtimeForRetry,
					promptForRetry,
					timeoutMs,
					unloadAfter,
					log,
					currentGenerationDurationMs: generation.durationMs,
					compileError,
				});
				if (retryAttempt) {
					scoringOnlyDurationMs += retryAttempt.scoringDurationMs;
					retryGenerationDurationMs += retryAttempt.generation.durationMs;
					const previousPassed = scoringResult.passed;
					const shouldPromoteRetry =
						retryAttempt.scoringResult.passed > previousPassed ||
						(retryAttempt.scoringResult.passed === previousPassed &&
							scoringResult.failureType === "import" &&
							retryAttempt.scoringResult.failureType !== "import");
					if (shouldPromoteRetry) {
						generation = retryAttempt.generation;
						scoringResult = retryAttempt.scoringResult;
						log.info(
							{
								harness: item.harness,
								test: item.test,
								passType: item.passType,
								beforePassed: previousPassed,
								afterPassed: retryAttempt.scoringResult.passed,
							},
							"Compile-feedback retry promoted as best attempt",
						);
					} else {
						log.warn(
							{
								harness: item.harness,
								test: item.test,
								passType: item.passType,
								beforePassed: previousPassed,
								retryPassed: retryAttempt.scoringResult.passed,
							},
							"Compile-feedback retry did not improve score; keeping original attempt",
						);
					}
				}
			}

			const scoringDurationMs = Math.round(
				performance.now() - scoringStartTime,
			);
			const scoringOnlyDurationMsRounded = Math.round(scoringOnlyDurationMs);

			automatedScore = {
				passed: scoringResult.passed,
				failed: scoringResult.failed,
				total: scoringResult.total,
			};

			scoringMetrics = {
				durationMs: scoringDurationMs,
				scoringDurationMs: scoringOnlyDurationMsRounded,
				...(retryGenerationDurationMs > 0 ? { retryGenerationDurationMs } : {}),
			};

			if (scoringResult.failureType && scoringResult.error) {
				scoringFailure = {
					type: scoringResult.failureType,
					message: scoringResult.error,
				};
			}

			log.info(
				{
					passed: scoringResult.passed,
					total: scoringResult.total,
					durationMs: scoringDurationMs,
					scoringDurationMs: scoringOnlyDurationMsRounded,
					...(retryGenerationDurationMs > 0
						? { retryGenerationDurationMs }
						: {}),
				},
				"Scoring completed",
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			scoringFailure = {
				type: classifyScoringError(errorMessage),
				message: errorMessage,
			};
			log.warn({ error: errorMessage }, "Scoring failed");
			// Don't fail the item, just record no score
		}
	}

	// Run frontier eval if API key is present and generation succeeded
	let frontierEval: FrontierEval | undefined;
	let frontierEvalFailure: MatrixItemResult["frontierEvalFailure"];
	const openRouterKey = getOpenRouterKey();
	if (
		openRouterKey &&
		generation.success &&
		(generation.output || generation.codeFilePath)
	) {
		const rubric = loadRubric(item.test);
		if (rubric) {
			try {
				log.debug("Running frontier eval...");
				// Use file if available from tool-calling harness, else extract from text
				let code: string;
				if (generation.codeFilePath) {
					const fs = await import("node:fs");
					code = fs.readFileSync(generation.codeFilePath, "utf-8");
				} else {
					// output must be truthy here (else branch + outer condition)
					const extracted = extractCode(generation.output!);
					code = extracted.code;
				}

				const evalResult = await evaluateWithFrontier(
					{
						code,
						rubric,
						testSlug: item.test,
					},
					openRouterKey,
				);

				if (evalResult.ok) {
					frontierEval = {
						score: evalResult.value.score,
						reasoning: evalResult.value.reasoning,
						model: evalResult.value.model,
						latencyMs: evalResult.value.latencyMs,
					};
				} else {
					frontierEvalFailure = evalResult.failure;
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				frontierEvalFailure = {
					type: "unknown",
					message: errorMessage,
				};
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
		runtime: item.runtime,
		model: item.model,
		harness: item.harness,
		test: item.test,
		category: item.category,
		passType: item.passType,
		status: generation.success ? "completed" : "failed",
		startedAt,
		completedAt,
		generation,
		automatedScore,
		scoringMetrics,
		frontierEval,
		generationFailure,
		scoringFailure,
		frontierEvalFailure,
	};
}
