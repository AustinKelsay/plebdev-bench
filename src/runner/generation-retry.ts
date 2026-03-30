/**
 * Purpose: Retry generation once when a harness-level failure is likely transient.
 * Exports: runGenerationWithInfraRetry, GenerationWithRetryContext, GenerationWithRetryResult
 *
 * Invariants:
 * - Only one retry is attempted, and only for `harness_error`.
 * - Workspace retries reseed from a fresh baseline before the second attempt.
 * - Non-retryable generation failures are returned unchanged.
 */

import type { Harness } from "../harnesses/index.js";
import { classifyGenerationError } from "../lib/failure-classifier.js";
import type { PreparedTestWorkspace } from "../lib/test-workspace.js";
import type { Runtime } from "../runtimes/index.js";
import type {
	GenerationResult,
	MatrixItem,
	MatrixItemResult,
} from "../schemas/index.js";

/** Minimal logger surface used by generation retry flow. */
interface RetryLogger {
	info: (obj: Record<string, unknown>, msg?: string) => void;
	warn: (obj: Record<string, unknown>, msg?: string) => void;
}

/** Execution context for generation with one infra retry. */
export interface GenerationWithRetryContext {
	item: MatrixItem;
	prompt: string;
	timeoutMs: number;
	unloadAfter: boolean;
	runtime: Runtime;
	harness: Harness;
	workspace?: PreparedTestWorkspace;
	prepareFreshWorkspace?: () => Promise<PreparedTestWorkspace | undefined>;
	log: RetryLogger;
}

/** Result of generation with retry metadata. */
export interface GenerationWithRetryResult {
	generation: GenerationResult;
	generationAttempts: number;
	generationFailure?: MatrixItemResult["generationFailure"];
	signalAssessment?: MatrixItemResult["signalAssessment"];
	workspace?: PreparedTestWorkspace;
}

/**
 * Executes generation and retries once on transient harness errors.
 *
 * @param context - Generation context and dependencies
 * @returns Final generation result plus retry metadata
 */
export async function runGenerationWithInfraRetry(
	context: GenerationWithRetryContext,
): Promise<GenerationWithRetryResult> {
	let workspace = context.workspace;
	let generationAttempts = 0;

	for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex += 1) {
		generationAttempts = attemptIndex;
		const generationStartTime = performance.now();

		try {
			const result =
				context.item.scoringMode === "workspace" && workspace
					? await context.harness.generate({
							model: context.item.model,
							prompt: context.prompt,
							timeoutMs: context.timeoutMs,
							unloadAfter: context.unloadAfter,
							runtime: context.runtime,
							promptMode: "workspace",
							workingDirectory: workspace.rootDir,
						})
					: await context.harness.generate({
							model: context.item.model,
							prompt: context.prompt,
							timeoutMs: context.timeoutMs,
							unloadAfter: context.unloadAfter,
							runtime: context.runtime,
							promptMode: "code-output",
						});

			context.log.info(
				{
					attempt: attemptIndex,
					durationMs: result.durationMs,
					harness: context.item.harness,
					codeFilePath: result.codeFilePath,
					workspaceDir: workspace?.rootDir,
				},
				"Generation completed",
			);

			return {
				generation: {
					success: true,
					output: result.output,
					durationMs: result.durationMs,
					promptTokens: result.promptTokens,
					completionTokens: result.completionTokens,
					codeFilePath: result.codeFilePath,
				},
				generationAttempts,
				signalAssessment: result.signalAssessment,
				workspace,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const errorDetails = error as {
				output?: string;
				durationMs?: number;
				signalAssessment?: MatrixItemResult["signalAssessment"];
			};
			const failureType = classifyGenerationError(errorMessage);
			const fallbackDurationMs = Math.round(
				performance.now() - generationStartTime,
			);
			const durationMs =
				typeof errorDetails.durationMs === "number"
					? errorDetails.durationMs
					: fallbackDurationMs;
			const output =
				typeof errorDetails.output === "string" &&
				errorDetails.output.trim().length > 0
					? errorDetails.output
					: undefined;
			const shouldRetryHarnessError =
				failureType === "harness_error" && attemptIndex === 1;

			if (shouldRetryHarnessError) {
				context.log.warn(
					{
						attempt: attemptIndex,
						error: errorMessage,
						failureType,
						harness: context.item.harness,
					},
					"Generation hit a harness error; retrying once with a fresh execution context",
				);
				if (context.prepareFreshWorkspace) {
					try {
						workspace = await context.prepareFreshWorkspace();
					} catch (workspaceError) {
						const workspaceErrorMessage =
							workspaceError instanceof Error
								? workspaceError.message
								: String(workspaceError);
						context.log.warn(
							{
								attempt: attemptIndex,
								error: workspaceErrorMessage,
								harness: context.item.harness,
							},
							"Failed to prepare a fresh workspace for retry",
						);
						return {
							generation: {
								success: false,
								error: `Failed to prepare fresh workspace for retry: ${workspaceErrorMessage}`,
								failureType: "harness_error",
								durationMs,
								output,
							},
							generationAttempts,
							signalAssessment: errorDetails.signalAssessment,
							generationFailure: {
								type: "harness_error",
								message: `Failed to prepare fresh workspace for retry: ${workspaceErrorMessage}`,
							},
							workspace,
						};
					}
				}
				continue;
			}

			context.log.warn(
				{
					attempt: attemptIndex,
					error: errorMessage,
					failureType,
					harness: context.item.harness,
				},
				"Generation failed",
			);

			return {
				generation: {
					success: false,
					error: errorMessage,
					failureType,
					durationMs,
					output,
				},
				generationAttempts,
				signalAssessment: errorDetails.signalAssessment,
				generationFailure: {
					type: failureType,
					message: errorMessage,
				},
				workspace,
			};
		}
	}

	throw new Error("Generation retry loop completed without a settled result");
}
