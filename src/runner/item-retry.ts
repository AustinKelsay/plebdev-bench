/**
 * Purpose: Shared prompt-loading and compile-retry helpers for matrix item execution.
 * Exports: loadPrompt, runCompileFeedbackRetry
 *
 * Invariants:
 * - Prompt files are loaded from src/tests/<slug>/prompt.<passType>.md.
 * - Compile retry is a single best-effort follow-up generation using compiler feedback.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Harness } from "../harnesses/index.js";
import { scoreGeneration } from "../lib/scorer.js";
import type { Runtime } from "../runtimes/index.js";
import type {
	GenerationResult,
	MatrixItem,
	MatrixItemResult,
	ScoringResult,
} from "../schemas/index.js";

/** Max compile error length embedded in retry prompt. */
const COMPILE_RETRY_ERROR_MAX_LENGTH = 1200;

/**
 * Loads a prompt file from a benchmark test directory.
 *
 * @param test - Test slug
 * @param passType - Pass type ('blind' or 'informed')
 * @returns Prompt file contents
 * @throws {Error} If the prompt file is missing
 */
export async function loadPrompt(
	test: string,
	passType: string,
): Promise<string> {
	const promptPath = path.join(
		process.cwd(),
		"src",
		"tests",
		test,
		`prompt.${passType}.md`,
	);

	try {
		return await fs.promises.readFile(promptPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`Prompt file not found: ${promptPath}`);
		}
		throw error;
	}
}

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
export interface CompileRetryContext {
	item: MatrixItem;
	harness: Harness;
	runtime: Runtime;
	promptForRetry: string;
	timeoutMs: number;
	unloadAfter: boolean;
	log: {
		warn: (obj: Record<string, unknown>, msg?: string) => void;
	};
	currentGenerationDurationMs: number;
	compileError: string;
}

/** Context for scoring with optional compile-feedback retry. */
export interface ScoringWithRetryContext {
	item: MatrixItem;
	generation: GenerationResult;
	harnessForRetry?: Harness;
	runtimeForRetry?: Runtime;
	promptForRetry: string;
	timeoutMs: number;
	unloadAfter: boolean;
	log: {
		info: (obj: Record<string, unknown>, msg?: string) => void;
		warn: (obj: Record<string, unknown>, msg?: string) => void;
	};
	workspaceDir?: string;
	supportsCompileRetry: boolean;
}

/**
 * Runs one compile-feedback retry attempt and scores the retry output.
 *
 * @param context - Retry context and dependencies
 * @returns Retry generation plus scoring result, or undefined if retry generation fails
 */
export async function runCompileFeedbackRetry(
	context: CompileRetryContext,
): Promise<
	| {
			generation: GenerationResult;
			scoringResult: ScoringResult;
			scoringDurationMs: number;
			signalAssessment?: MatrixItemResult["signalAssessment"];
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
		// workspaceDir is omitted intentionally: compile retry only applies to code-module scoring.
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
			signalAssessment: retryResult.signalAssessment,
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
 * Runs automated scoring and optionally retries once with compiler feedback.
 *
 * @param context - Scoring context plus optional retry dependencies
 * @returns Scoring result, updated generation, and timing metadata
 */
export async function runScoringWithCompileRetry(
	context: ScoringWithRetryContext,
): Promise<{
	scoringResult: ScoringResult;
	generation: GenerationResult;
	scoringOnlyDurationMs: number;
	retryGenerationDurationMs: number;
	compileRetryUsed: boolean;
	retryAttempted: boolean;
	retryKind?: "compile-feedback";
	retryReason?: string;
	retryPromoted?: boolean;
	signalAssessment?: MatrixItemResult["signalAssessment"];
}> {
	let generation = context.generation;
	let compileRetryUsed = false;
	let retryAttempted = false;
	let retryReason: string | undefined;
	let retryPromoted: boolean | undefined;
	let scoringOnlyDurationMs = 0;
	let retryGenerationDurationMs = 0;
	let signalAssessment: MatrixItemResult["signalAssessment"];
	let scoringResult: ScoringResult;
	let initialScoringStartTime = 0;

	try {
		initialScoringStartTime = performance.now();
		scoringResult = await scoreGeneration(
			context.item.test,
			generation.output ?? "",
			undefined,
			generation.codeFilePath,
			context.workspaceDir,
		);
		scoringOnlyDurationMs += performance.now() - initialScoringStartTime;
	} catch (scoringError) {
		scoringOnlyDurationMs += performance.now() - initialScoringStartTime;
		const scoringErrorMessage =
			scoringError instanceof Error
				? scoringError.message
				: String(scoringError);
		if (
			context.supportsCompileRetry &&
			context.harnessForRetry &&
			context.runtimeForRetry &&
			context.promptForRetry.length > 0
		) {
			retryAttempted = true;
			retryReason = scoringErrorMessage;
			const retryFromException = await runCompileFeedbackRetry({
				item: context.item,
				harness: context.harnessForRetry,
				runtime: context.runtimeForRetry,
				promptForRetry: context.promptForRetry,
				timeoutMs: context.timeoutMs,
				unloadAfter: context.unloadAfter,
				log: context.log,
				currentGenerationDurationMs: generation.durationMs,
				compileError: scoringErrorMessage,
			});
			if (retryFromException) {
				compileRetryUsed = true;
				retryPromoted = true;
				generation = retryFromException.generation;
				scoringResult = retryFromException.scoringResult;
				scoringOnlyDurationMs += retryFromException.scoringDurationMs;
				retryGenerationDurationMs += retryFromException.generation.durationMs;
				signalAssessment = retryFromException.signalAssessment;
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
		context.supportsCompileRetry &&
		typeof compileError === "string" &&
		context.harnessForRetry &&
		context.runtimeForRetry &&
		context.promptForRetry.length > 0
	) {
		retryAttempted = true;
		retryReason = compileError;
		const retryAttempt = await runCompileFeedbackRetry({
			item: context.item,
			harness: context.harnessForRetry,
			runtime: context.runtimeForRetry,
			promptForRetry: context.promptForRetry,
			timeoutMs: context.timeoutMs,
			unloadAfter: context.unloadAfter,
			log: context.log,
			currentGenerationDurationMs: generation.durationMs,
			compileError,
		});
		if (retryAttempt) {
			compileRetryUsed = true;
			scoringOnlyDurationMs += retryAttempt.scoringDurationMs;
			retryGenerationDurationMs += retryAttempt.generation.durationMs;
			const previousPassed = scoringResult.passed;
			const shouldPromoteRetry =
				retryAttempt.scoringResult.passed > previousPassed ||
				(retryAttempt.scoringResult.passed === previousPassed &&
					scoringResult.failureType === "import" &&
					retryAttempt.scoringResult.failureType !== "import");
			if (shouldPromoteRetry) {
				retryPromoted = true;
				generation = retryAttempt.generation;
				scoringResult = retryAttempt.scoringResult;
				signalAssessment = retryAttempt.signalAssessment;
				context.log.info(
					{
						harness: context.item.harness,
						test: context.item.test,
						passType: context.item.passType,
						beforePassed: previousPassed,
						afterPassed: retryAttempt.scoringResult.passed,
					},
					"Compile-feedback retry promoted as best attempt",
				);
			} else {
				retryPromoted = false;
				context.log.warn(
					{
						harness: context.item.harness,
						test: context.item.test,
						passType: context.item.passType,
						beforePassed: previousPassed,
						retryPassed: retryAttempt.scoringResult.passed,
					},
					"Compile-feedback retry did not improve score; keeping original attempt",
				);
			}
		}
	}

	return {
		scoringResult,
		generation,
		scoringOnlyDurationMs,
		retryGenerationDurationMs,
		compileRetryUsed,
		retryAttempted,
		...(retryAttempted
			? {
					retryKind: "compile-feedback" as const,
					retryReason: retryReason ?? "compile feedback retry",
					retryPromoted: retryPromoted ?? false,
				}
			: {}),
		signalAssessment,
	};
}
