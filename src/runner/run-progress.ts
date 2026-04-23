/**
 * Purpose: Runner progress snapshots, checkpoint writing, and guard-failure rows.
 * Exports: buildRunResultSnapshot, printModelGuardReport, readErrorMessage,
 *          buildResidencyGuardFailureResult, shouldWriteProgressCheckpoint,
 *          writeProgressCheckpoint
 *
 * Invariants:
 * - Progress snapshots use the same RunResult shape for partial and final writes.
 * - Residency guard failures are serialized as normal per-item generation failures.
 */

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
			verificationStatus: "self_reported",
			source: plan.provenance?.source ?? "local_cli",
			...(plan.provenance?.submittedBy
				? { submittedBy: plan.provenance.submittedBy }
				: {}),
			...(plan.provenance?.submittedAt
				? { submittedAt: plan.provenance.submittedAt }
				: {}),
			...(plan.provenance?.notes ? { notes: plan.provenance.notes } : {}),
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
 * Prints a deterministic model guard line only when unloads were requested.
 *
 * @param report - Ollama residency report from the model guard
 * @returns Nothing; writes to stdout when unloads occurred
 */
export function printModelGuardReport(report: OllamaResidencyReport): void {
	if (report.unloadedModels.length === 0) return;
	console.log(
		`model guard: allowed=${report.allowedModel ?? "none"} unloaded=${report.unloadedModels.join(",")}`,
	);
}

/**
 * Converts an arbitrary thrown value into a user-facing message.
 *
 * @param error - Unknown thrown value
 * @returns Error message string
 */
export function readErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Builds a failed item result for a pre-item residency guard failure.
 *
 * @param item - Matrix item that could not be executed
 * @param error - Residency guard failure
 * @returns Matrix item result using the standard generation failure shape
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
	};
}

/**
 * Determines whether the current result count should write a partial checkpoint.
 *
 * @param itemCount - Completed or failed item count
 * @param total - Total planned item count
 * @param lastCheckpointItemCount - Item count at the last checkpoint
 * @returns True when a checkpoint should be written
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
			checkpointPath: `${input.config.outputDir}/${input.plan.runId}/run.partial.json`,
		},
		"Wrote run checkpoint",
	);
}
