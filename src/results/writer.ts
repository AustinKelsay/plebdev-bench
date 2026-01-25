/**
 * Purpose: Write plan.json and run.json to the results directory.
 * Exports: writePlan, writeResult
 *
 * Output structure:
 * results/<runId>/
 *   plan.json  - Expanded matrix plan (for reproducibility)
 *   run.json   - Execution results
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RunPlanSchema, RunResultSchema, type RunPlan, type RunResult } from "../schemas/index.js";

/**
 * Ensures the output directory exists.
 */
function ensureDir(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * Writes the run plan to plan.json.
 *
 * @param outputDir - Base output directory (e.g., 'results')
 * @param plan - The run plan to write
 *
 * @throws {Error} On file system errors
 */
export async function writePlan(outputDir: string, plan: RunPlan): Promise<void> {
	// Validate before writing
	RunPlanSchema.parse(plan);

	const runDir = path.join(outputDir, plan.runId);
	ensureDir(runDir);

	const planPath = path.join(runDir, "plan.json");
	const content = JSON.stringify(plan, null, 2);

	fs.writeFileSync(planPath, content, "utf-8");
}

/**
 * Writes the run result to run.json.
 *
 * @param outputDir - Base output directory (e.g., 'results')
 * @param result - The run result to write
 *
 * @throws {Error} On file system errors or schema validation failure
 */
export async function writeResult(
	outputDir: string,
	result: RunResult,
): Promise<void> {
	// Validate before writing
	RunResultSchema.parse(result);

	const runDir = path.join(outputDir, result.runId);
	ensureDir(runDir);

	const resultPath = path.join(runDir, "run.json");
	const content = JSON.stringify(result, null, 2);

	fs.writeFileSync(resultPath, content, "utf-8");
}
