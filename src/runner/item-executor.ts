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
import { prepareTestWorkspace } from "../lib/test-workspace.js";
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
import { loadPrompt, runCompileFeedbackRetry } from "./item-retry.js";

/** Runtime and harness configuration for item execution. */
interface RuntimeUrls {
	ollamaBaseUrl: string;
	vllmBaseUrl: string;
	gooseMaxTurns: number;
	gooseRetryMaxTurns: number;
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
	const workspace =
		item.scoringMode === "workspace"
			? await prepareTestWorkspace(item.test)
			: undefined;
	const log = logger.child({
		itemId: item.id,
		runtime: item.runtime,
		model: item.model,
		harness: item.harness,
		test: item.test,
		category: item.category,
		scoringMode: item.scoringMode,
		passType: item.passType,
	});

	const startedAt = new Date().toISOString();
	try {
		let generation: GenerationResult;
		let generationFailure: MatrixItemResult["generationFailure"];
		let generationStartTime: number | undefined;
		let promptForRetry = "";
		let runtimeForRetry: ReturnType<typeof createRuntime> | undefined;
		let harnessForRetry: ReturnType<typeof createHarness> | undefined;

		try {
			log.debug("Loading prompt...");
			const prompt = loadPrompt(item.test, item.passType);
			promptForRetry = prompt;

			const runtime = createRuntime(item.runtime, {
				ollamaBaseUrl: runtimeConfig.ollamaBaseUrl,
				vllmBaseUrl: runtimeConfig.vllmBaseUrl,
				defaultTimeoutMs: timeoutMs,
			});
			runtimeForRetry = runtime;

			log.debug({ harness: item.harness }, "Creating harness...");
			const harness = createHarness(item.harness, {
				goose: {
					maxTurns: runtimeConfig.gooseMaxTurns,
					retryMaxTurns: runtimeConfig.gooseRetryMaxTurns,
				},
			});
			harnessForRetry = harness;

			generationStartTime = performance.now();
			const result = await harness.generate({
				model: item.model,
				prompt,
				timeoutMs,
				unloadAfter,
				runtime,
				promptMode:
					item.scoringMode === "workspace" ? "workspace" : "code-output",
				...(workspace ? { workingDirectory: workspace.rootDir } : {}),
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
					workspaceDir: workspace?.rootDir,
				},
				"Generation completed",
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
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

		let automatedScore: AutomatedScore | undefined;
		let scoringMetrics: ScoringMetrics | undefined;
		let scoringFailure: MatrixItemResult["scoringFailure"];
		if (generation.success) {
			try {
				log.debug("Running automated scoring...");
				const scoringStartTime = performance.now();
				const supportsCompileRetry =
					item.scoringMode === "code-module" &&
					(item.harness === "goose" || item.harness === "opencode");
				let compileRetryUsed = false;
				let scoringResult: ScoringResult;
				let scoringOnlyDurationMs = 0;
				let retryGenerationDurationMs = 0;

				try {
					const initialScoringStartTime = performance.now();
					scoringResult = await scoreGeneration(
						item.test,
						generation.output ?? "",
						undefined,
						generation.codeFilePath,
						workspace?.rootDir,
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
					...(retryGenerationDurationMs > 0
						? { retryGenerationDurationMs }
						: {}),
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
			}
		}

		let frontierEval: FrontierEval | undefined;
		let frontierEvalFailure: MatrixItemResult["frontierEvalFailure"];
		const openRouterKey = getOpenRouterKey();
		if (
			item.scoringMode === "code-module" &&
			openRouterKey &&
			generation.success &&
			(generation.output || generation.codeFilePath)
		) {
			const rubric = loadRubric(item.test);
			if (rubric) {
				try {
					log.debug("Running frontier eval...");
					let code: string;
					if (generation.codeFilePath) {
						code = fs.readFileSync(generation.codeFilePath, "utf-8");
					} else {
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
	} finally {
		await workspace?.cleanup();
	}
}
