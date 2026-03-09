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
import type { createHarness } from "../harnesses/index.js";
import { scoreGeneration } from "../lib/scorer.js";
import type { createRuntime } from "../runtimes/index.js";
import type {
	GenerationResult,
	MatrixItem,
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
export function loadPrompt(test: string, passType: string): string {
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
