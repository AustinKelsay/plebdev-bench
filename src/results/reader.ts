/**
 * Purpose: Read plan.json and run.json from the results directory.
 * Exports: readPlan, readResult, findRunDir
 *
 * This module is used by the compare command (stub for MVP).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RunPlanSchema, RunResultSchema, type RunPlan, type RunResult } from "../schemas/index.js";

/**
 * Finds a run directory by run ID or path.
 *
 * @param outputDir - Base output directory (e.g., 'results')
 * @param runIdOrPath - Run ID (e.g., '20260114-143052-abc123') or full path
 * @returns Resolved path to the run directory
 *
 * @throws {Error} If run directory not found
 */
export function findRunDir(outputDir: string, runIdOrPath: string): string {
	// If it's already a path, use it directly
	if (runIdOrPath.includes(path.sep) || runIdOrPath.startsWith(".")) {
		if (fs.existsSync(runIdOrPath)) {
			return runIdOrPath;
		}
		throw new Error(`Run directory not found: ${runIdOrPath}`);
	}

	// Otherwise, look in the output directory
	const runDir = path.join(outputDir, runIdOrPath);
	if (fs.existsSync(runDir)) {
		return runDir;
	}

	throw new Error(`Run not found: ${runIdOrPath} (looked in ${outputDir})`);
}

/**
 * Reads and validates plan.json from a run directory.
 *
 * @param runDir - Path to the run directory
 * @returns Parsed and validated run plan
 *
 * @throws {Error} On file read or validation errors
 */
export function readPlan(runDir: string): RunPlan {
	const planPath = path.join(runDir, "plan.json");

	if (!fs.existsSync(planPath)) {
		throw new Error(`Plan file not found: ${planPath}`);
	}

	const content = fs.readFileSync(planPath, "utf-8");
	const data = JSON.parse(content);

	return RunPlanSchema.parse(data);
}

/**
 * Reads and validates run.json from a run directory.
 *
 * @param runDir - Path to the run directory
 * @returns Parsed and validated run result
 *
 * @throws {Error} On file read or validation errors
 */
export function readResult(runDir: string): RunResult {
	const resultPath = path.join(runDir, "run.json");

	if (!fs.existsSync(resultPath)) {
		throw new Error(`Result file not found: ${resultPath}`);
	}

	const content = fs.readFileSync(resultPath, "utf-8");
	const data = JSON.parse(content);

	return RunResultSchema.parse(data);
}
