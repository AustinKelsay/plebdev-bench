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
import { loadRubric } from "../lib/scoring-spec.js";
import {
	finalizeItemSignalAssessment,
	mergeSignalAssessments,
} from "../lib/signal-assessment.js";
import { prepareTestWorkspace } from "../lib/test-workspace.js";
import { createRuntime } from "../runtimes/index.js";
import type {
	AutomatedScore,
	FrontierEval,
	GenerationFailureType,
	GenerationResult,
	MatrixItem,
	MatrixItemResult,
	ScoringMetrics,
	SignalAssessment,
} from "../schemas/index.js";
import {
	SignalAssessmentSchema,
	generationFailureTypes,
} from "../schemas/index.js";
import { runGenerationWithInfraRetry } from "./generation-retry.js";
import { loadPrompt, runScoringWithCompileRetry } from "./item-retry.js";

/** Runtime and harness configuration for item execution. */
interface RuntimeUrls {
	ollamaBaseUrl: string;
	gooseMaxTurns: number;
	gooseRetryMaxTurns: number;
	gooseWorkspaceMaxTurns: number;
	gooseWorkspaceRetryMaxTurns: number;
}

const GENERATION_FAILURE_TYPE_SET = new Set(generationFailureTypes);

/**
 * Narrows artifact runtime values to the runtime set supported by live execution.
 *
 * Historical artifacts may contain additional runtime labels, but the runner only
 * executes Ollama-backed plans.
 *
 * @param runtime - Runtime value from the plan item
 * @returns Executable runtime name accepted by createRuntime
 * @throws {Error} When an unsupported runtime appears in a live execution path
 */
function getExecutableRuntimeName(
	runtime: MatrixItem["runtime"],
): Parameters<typeof createRuntime>[0] {
	if (runtime !== "ollama") {
		throw new Error(
			`Unsupported runtime "${runtime}" in live execution. Only "ollama" is supported.`,
		);
	}
	return runtime;
}

/**
 * Returns whether an unknown value is a valid generation failure type.
 *
 * @param value - Unknown candidate
 * @returns True when the value is a supported generation failure literal
 */
function isGenerationFailureType(
	value: unknown,
): value is GenerationFailureType {
	return (
		typeof value === "string" &&
		GENERATION_FAILURE_TYPE_SET.has(value as GenerationFailureType)
	);
}

/**
 * Extracts structured generation failure details from an unknown thrown value.
 *
 * @param error - Thrown value from harness/runtime execution
 * @returns Normalized generation failure details
 */
function extractGenerationFailureDetails(error: unknown): {
	errorMessage: string;
	failureType: GenerationFailureType;
	durationMs: number;
	output: string | undefined;
	signalAssessment: SignalAssessment | undefined;
} {
	const errorRecord =
		typeof error === "object" && error !== null
			? (error as Record<string, unknown>)
			: undefined;
	const errorMessage =
		error instanceof Error
			? error.message
			: typeof errorRecord?.message === "string"
				? errorRecord.message
				: String(error);
	const failureType = isGenerationFailureType(errorRecord?.failureType)
		? errorRecord.failureType
		: classifyGenerationError(errorMessage);
	const signalAssessmentParse = SignalAssessmentSchema.safeParse(
		errorRecord?.signalAssessment,
	);
	return {
		errorMessage,
		failureType,
		durationMs:
			typeof errorRecord?.durationMs === "number" &&
			Number.isFinite(errorRecord.durationMs) &&
			errorRecord.durationMs >= 0
				? errorRecord.durationMs
				: 0,
		output:
			typeof errorRecord?.output === "string" ? errorRecord.output : undefined,
		signalAssessment: signalAssessmentParse.success
			? signalAssessmentParse.data
			: undefined,
	};
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
		scoringMode: item.scoringMode,
		passType: item.passType,
	});

	const startedAt = new Date().toISOString();
	const runtime = createRuntime(getExecutableRuntimeName(item.runtime), {
		ollamaBaseUrl: runtimeConfig.ollamaBaseUrl,
		defaultTimeoutMs: timeoutMs,
	});
	log.debug("Loading prompt...");
	const prompt = await loadPrompt(item.test, item.passType);
	log.debug({ harness: item.harness }, "Creating harness...");
	const harness = createHarness(item.harness, {
		goose: {
			maxTurns: runtimeConfig.gooseMaxTurns,
			retryMaxTurns: runtimeConfig.gooseRetryMaxTurns,
			workspaceMaxTurns: runtimeConfig.gooseWorkspaceMaxTurns,
			workspaceRetryMaxTurns: runtimeConfig.gooseWorkspaceRetryMaxTurns,
		},
	});
	let workspace: Awaited<ReturnType<typeof prepareTestWorkspace>> | undefined;
	let generationAttempts = 0;
	try {
		if (item.scoringMode === "workspace") {
			workspace = await prepareTestWorkspace(item.test);
		}

		let generation: GenerationResult;
		let generationFailure: MatrixItemResult["generationFailure"];
		let signalAssessment: MatrixItemResult["signalAssessment"];
		const runtimeForRetry: ReturnType<typeof createRuntime> | undefined =
			runtime;
		const harnessForRetry: ReturnType<typeof createHarness> | undefined =
			harness;

		try {
			const generationOutcome = await runGenerationWithInfraRetry({
				item,
				prompt,
				timeoutMs,
				unloadAfter,
				runtime,
				harness,
				workspace,
				prepareFreshWorkspace:
					item.scoringMode === "workspace"
						? async () => {
								await workspace?.cleanup();
								return prepareTestWorkspace(item.test);
							}
						: undefined,
				log,
			});
			generation = generationOutcome.generation;
			generationAttempts = generationOutcome.generationAttempts;
			generationFailure = generationOutcome.generationFailure;
			signalAssessment = generationOutcome.signalAssessment;
			workspace = generationOutcome.workspace;
		} catch (error) {
			const {
				errorMessage,
				failureType,
				durationMs,
				output,
				signalAssessment: existingSignalAssessment,
			} = extractGenerationFailureDetails(error);
			generation = {
				success: false,
				error: errorMessage,
				failureType,
				durationMs,
				...(output !== undefined ? { output } : {}),
			};
			generationFailure = {
				type: failureType,
				message: errorMessage,
			};
			signalAssessment = finalizeItemSignalAssessment({
				existing: existingSignalAssessment,
				automatedScore: undefined,
				rowFailed: true,
				output: generation.output,
			});
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
				const supportsCompileRetry = item.scoringMode === "code-module";
				const scoringOutcome = await runScoringWithCompileRetry({
					item,
					generation,
					harnessForRetry,
					runtimeForRetry,
					promptForRetry: prompt,
					timeoutMs,
					unloadAfter,
					log,
					workspaceDir: workspace?.rootDir,
					supportsCompileRetry,
				});
				generation = scoringOutcome.generation;
				signalAssessment = mergeSignalAssessments(
					signalAssessment,
					scoringOutcome.signalAssessment,
				);
				const scoringResult = scoringOutcome.scoringResult;
				const scoringOnlyDurationMsRounded = Math.round(
					scoringOutcome.scoringOnlyDurationMs,
				);

				const scoringDurationMs = Math.round(
					performance.now() - scoringStartTime,
				);

				automatedScore = {
					passed: scoringResult.passed,
					failed: scoringResult.failed,
					total: scoringResult.total,
				};

				scoringMetrics = {
					durationMs: scoringDurationMs,
					scoringDurationMs: scoringOnlyDurationMsRounded,
					...(scoringOutcome.retryGenerationDurationMs > 0
						? {
								retryGenerationDurationMs:
									scoringOutcome.retryGenerationDurationMs,
							}
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
						...(scoringOutcome.retryGenerationDurationMs > 0
							? {
									retryGenerationDurationMs:
										scoringOutcome.retryGenerationDurationMs,
								}
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
		signalAssessment = finalizeItemSignalAssessment({
			existing: signalAssessment,
			automatedScore,
			rowFailed:
				!generation.success ||
				(automatedScore?.failed ?? 0) > 0 ||
				scoringFailure !== undefined,
			output: generation.output,
		});

		return {
			id: item.id,
			runtime: item.runtime,
			model: item.model,
			...(item.modelAlias ? { modelAlias: item.modelAlias } : {}),
			...(item.modelProfile ? { modelProfile: item.modelProfile } : {}),
			harness: item.harness,
			test: item.test,
			category: item.category,
			passType: item.passType,
			status:
				generation.success && scoringFailure === undefined
					? "completed"
					: "failed",
			startedAt,
			completedAt,
			generation,
			...(generationAttempts > 0 ? { generationAttempts } : {}),
			automatedScore,
			scoringMetrics,
			frontierEval,
			generationFailure,
			scoringFailure,
			frontierEvalFailure,
			signalAssessment,
		};
	} catch (error) {
		const {
			errorMessage,
			failureType,
			durationMs,
			output,
			signalAssessment: existingSignalAssessment,
		} = extractGenerationFailureDetails(error);
		const completedAt = new Date().toISOString();
		log.warn({ error: errorMessage, failureType }, "Item execution failed");
		return {
			id: item.id,
			runtime: item.runtime,
			model: item.model,
			...(item.modelAlias ? { modelAlias: item.modelAlias } : {}),
			...(item.modelProfile ? { modelProfile: item.modelProfile } : {}),
			harness: item.harness,
			test: item.test,
			category: item.category,
			passType: item.passType,
			status: "failed",
			startedAt,
			completedAt,
			generation: {
				success: false,
				error: errorMessage,
				failureType,
				durationMs,
				...(output !== undefined ? { output } : {}),
			},
			...(generationAttempts > 0 ? { generationAttempts } : {}),
			generationFailure: {
				type: failureType,
				message: errorMessage,
			},
			signalAssessment: finalizeItemSignalAssessment({
				existing: existingSignalAssessment,
				automatedScore: undefined,
				rowFailed: true,
				output,
			}),
		};
	} finally {
		try {
			await workspace?.cleanup();
		} catch (error) {
			log.warn(
				{
					error: error instanceof Error ? error.message : String(error),
					workspaceDir: workspace?.rootDir,
				},
				"Workspace cleanup failed",
			);
		}
	}
}
