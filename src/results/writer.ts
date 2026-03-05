/**
 * Purpose: Write plan and result artifacts to the results directory.
 * Exports: writePlan, writeResult, writePartialResult, deletePartialResult
 *
 * Output structure:
 * results/<runId>/
 *   plan.json         - Expanded matrix plan (reproducibility)
 *   run.json          - Final execution results
 *   run.partial.json  - Periodic crash-safe snapshot during execution
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	RunPlanSchema,
	RunResultSchema,
	type RunPlan,
	type RunResult,
} from "../schemas/index.js";

/**
 * Ensures the output directory exists.
 *
 * @param dirPath - Directory to create when missing
 */
function ensureDir(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * Writes the run plan to `plan.json`.
 *
 * @param outputDir - Base output directory (e.g., `results`)
 * @param plan - Run plan payload
 * @throws {Error} On validation or filesystem errors
 */
export async function writePlan(outputDir: string, plan: RunPlan): Promise<void> {
	RunPlanSchema.parse(plan);

	const runDir = path.join(outputDir, plan.runId);
	ensureDir(runDir);

	const planPath = path.join(runDir, "plan.json");
	const content = JSON.stringify(plan, null, 2);
	await fs.promises.writeFile(planPath, content, "utf-8");
}

/**
 * Writes final run results to `run.json`.
 *
 * @param outputDir - Base output directory (e.g., `results`)
 * @param result - Final run result payload
 * @throws {Error} On validation or filesystem errors
 */
export async function writeResult(
	outputDir: string,
	result: RunResult,
): Promise<void> {
	RunResultSchema.parse(result);

	const runDir = path.join(outputDir, result.runId);
	ensureDir(runDir);

	const resultPath = path.join(runDir, "run.json");
	const content = JSON.stringify(result, null, 2);
	await fs.promises.writeFile(resultPath, content, "utf-8");
}

/**
 * Writes a crash-safe snapshot to `run.partial.json`.
 *
 * @param outputDir - Base output directory (e.g., `results`)
 * @param result - Current run snapshot payload
 * @throws {Error} On validation or filesystem errors
 */
export async function writePartialResult(
	outputDir: string,
	result: RunResult,
): Promise<void> {
	RunResultSchema.parse(result);

	const runDir = path.join(outputDir, result.runId);
	ensureDir(runDir);

	const partialPath = path.join(runDir, "run.partial.json");
	const tempPath = `${partialPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 10)}.tmp`;
	const content = JSON.stringify(result, null, 2);
	try {
		await fs.promises.writeFile(tempPath, content, "utf-8");
		await fs.promises.rename(tempPath, partialPath);
	} catch (error) {
		try {
			fs.unlinkSync(tempPath);
		} catch (cleanupError) {
			if (
				!(
					cleanupError &&
					typeof cleanupError === "object" &&
					"code" in cleanupError &&
					(cleanupError as { code?: unknown }).code === "ENOENT"
				)
			) {
				throw cleanupError;
			}
		}
		throw error;
	}
}

/**
 * Deletes `run.partial.json` after successful completion.
 *
 * @param outputDir - Base output directory (e.g., `results`)
 * @param runId - Run identifier
 * @throws {Error} On filesystem errors except missing file
 */
export function deletePartialResult(outputDir: string, runId: string): void {
	const partialPath = path.join(outputDir, runId, "run.partial.json");
	try {
		fs.unlinkSync(partialPath);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT"
		) {
			return;
		}
		throw error;
	}
}
