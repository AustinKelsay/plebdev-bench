/**
 * Purpose: Runner progress snapshots, checkpoint writing, and guard-failure rows.
 * Exports: buildRunResultSnapshot, printModelGuardReport, readErrorMessage,
 *          buildResidencyGuardFailureResult, shouldWriteProgressCheckpoint,
 *          buildPreflightSkipResult, writeProgressCheckpoint
 *
 * Invariants:
 * - Progress snapshots use the same RunResult shape for partial and final writes.
 * - Residency guard failures are serialized as normal per-item generation failures.
 * - Preflight skips are deterministic failed item rows with zero runtime duration.
 */

import * as path from "node:path";
import type { Logger } from "pino";
import { createTrustworthySignalAssessment } from "../lib/signal-assessment.js";
import { writePartialResult } from "../results/writer.js";
import type { OllamaResidencyReport } from "../runtimes/ollama-residency.js";
import type {
	BenchConfig,
	MatrixItem,
	MatrixItemResult,
	RunPlan,
	RunResult,
} from "../schemas/index.js";
import { SCHEMA_VERSION } from "../schemas/index.js";

/** Write crash-safe run checkpoints every N completed items. */
const PARTIAL_RESULT_CHECKPOINT_INTERVAL = 20;

/**
 * Builds a run result snapshot from current progress.
 *
 * @param plan - Run plan metadata source
 * @param startedAt - Run start timestamp
 * @param runStartTimeMs - Run start timestamp from performance.now()
 * @param total - Total planned items
 * @param results - Completed item results so far
 * @returns Run result snapshot payload
 * @throws {never} This helper only assembles an in-memory result object
 */
export function buildRunResultSnapshot(
	plan: RunPlan,
	startedAt: string,
	runStartTimeMs: number,
	total: number,
	results: MatrixItemResult[],
): RunResult {
	const completed = results.filter((r) => r.status === "completed").length;
	const failed = results.filter((r) => r.status === "failed").length;
	const pending = Math.max(0, total - results.length);
	const completedAt = new Date().toISOString();
	const durationMs = Math.round(performance.now() - runStartTimeMs);

	return {
		schemaVersion: SCHEMA_VERSION,
		runId: plan.runId,
		...(plan.machine ? { machine: plan.machine } : {}),
		...(plan.benchmarkCheckpoint
			? { benchmarkCheckpoint: plan.benchmarkCheckpoint }
			: {}),
		provenance: {
			...plan.provenance,
			verificationStatus: "self_reported",
			source: plan.provenance?.source ?? "local_cli",
		},
		startedAt,
		completedAt,
		durationMs,
		summary: {
			total,
			completed,
			failed,
			pending,
		},
		items: results,
	};
}

/**
 * Emits a structured model guard report only when unloads were requested.
 *
 * @param report - Ollama residency report from the model guard
 * @param log - Run logger used for structured progress output
 * @returns Nothing; writes a structured log when unloads occurred
 * @throws {Error} If the logger write fails or the report shape is malformed at runtime
 */
export function printModelGuardReport(
	report: OllamaResidencyReport,
	log: Pick<Logger, "info">,
): void {
	if (report.unloadedModels.length === 0) return;
	log.info(
		{
			allowedModel: report.allowedModel ?? "none",
			unloadedModels: report.unloadedModels,
		},
		"model guard report",
	);
}

/**
 * Converts an arbitrary thrown value into a user-facing message.
 *
 * @param error - Unknown thrown value
 * @returns Error message string
 * @throws {never} This helper only stringifies thrown values
 */
export function readErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	try {
		return String(error);
	} catch {
		try {
			return Object.prototype.toString.call(error);
		} catch {
			return "<unserializable error>";
		}
	}
}

/**
 * Builds a failed item result for a pre-item residency guard failure.
 *
 * @param item - Matrix item that could not be executed
 * @param error - Residency guard failure
 * @returns Matrix item result using the standard generation failure shape
 * @throws {never} This helper only assembles an in-memory result object
 */
export function buildResidencyGuardFailureResult(
	item: MatrixItem,
	error: unknown,
): MatrixItemResult {
	const now = new Date().toISOString();
	const message = readErrorMessage(error);
	return {
		id: item.id,
		runtime: item.runtime,
		model: item.model,
		...(item.modelAlias ? { modelAlias: item.modelAlias } : {}),
		...(item.modelProfile ? { modelProfile: item.modelProfile } : {}),
		harness: item.harness,
		test: item.test,
		...(item.category ? { category: item.category } : {}),
		passType: item.passType,
		status: "failed",
		startedAt: now,
		completedAt: now,
		generation: {
			success: false,
			error: `Residency guard failed: ${message}`,
			failureType: "api_error",
			durationMs: 0,
		},
		generationFailure: {
			type: "api_error",
			message: `Residency guard failed: ${message}`,
		},
		signalAssessment: createTrustworthySignalAssessment(),
	};
}

/**
 * Builds a failed item result for a row skipped after tool preflight failure.
 *
 * @param item - Matrix item skipped before execution
 * @param message - Preflight failure reason that caused the skip
 * @param failureType - Stable failure type inherited from the preflight failure
 * @returns Matrix item result using the standard generation failure shape
 * @throws {never} This helper only assembles an in-memory result object
 */
export function buildPreflightSkipResult(
	item: MatrixItem,
	message: string,
	failureType: NonNullable<MatrixItemResult["generationFailure"]>["type"],
): MatrixItemResult {
	const now = new Date().toISOString();
	const errorMessage = `Skipped: ${message}`;
	return {
		id: item.id,
		runtime: item.runtime,
		model: item.model,
		...(item.modelAlias ? { modelAlias: item.modelAlias } : {}),
		...(item.modelProfile ? { modelProfile: item.modelProfile } : {}),
		harness: item.harness,
		test: item.test,
		...(item.category ? { category: item.category } : {}),
		passType: item.passType,
		status: "failed",
		startedAt: now,
		completedAt: now,
		generation: {
			success: false,
			error: errorMessage,
			failureType,
			durationMs: 0,
		},
		generationFailure: {
			type: failureType,
			message: errorMessage,
		},
		signalAssessment: createTrustworthySignalAssessment(),
	};
}

/**
 * Determines whether the current result count should write a partial checkpoint.
 *
 * @param itemCount - Completed or failed item count
 * @param total - Total planned item count
 * @param lastCheckpointItemCount - Item count at the last checkpoint
 * @returns True when a checkpoint should be written
 * @throws {never} This helper only compares numeric counters
 */
export function shouldWriteProgressCheckpoint(
	itemCount: number,
	total: number,
	lastCheckpointItemCount: number,
): boolean {
	return (
		itemCount === total ||
		itemCount - lastCheckpointItemCount >= PARTIAL_RESULT_CHECKPOINT_INTERVAL
	);
}

/**
 * Writes a partial run result snapshot through the normal result serializer.
 *
 * @param input - Current run progress, config, and logger
 * @returns Resolves after the checkpoint is written
 * @throws {Error} If partial result serialization fails
 */
export async function writeProgressCheckpoint(input: {
	config: BenchConfig;
	plan: RunPlan;
	startedAt: string;
	startTime: number;
	total: number;
	results: MatrixItemResult[];
	log: { info: (obj: Record<string, unknown>, msg: string) => void };
}): Promise<void> {
	const partialSnapshot = buildRunResultSnapshot(
		input.plan,
		input.startedAt,
		input.startTime,
		input.total,
		input.results,
	);
	await writePartialResult(input.config.outputDir, partialSnapshot);
	input.log.info(
		{
			completedItems: input.results.length,
			totalItems: input.total,
			checkpointPath: path.join(
				input.config.outputDir,
				input.plan.runId,
				"run.partial.json",
			),
		},
		"Wrote run checkpoint",
	);
}
