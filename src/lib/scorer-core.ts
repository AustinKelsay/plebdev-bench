/**
 * Purpose: In-process scoring dispatcher shared by the main runner and worker subprocess.
 * Exports: scoreGenerationInProcess
 *
 * Invariants:
 * - Loads and validates the scoring spec before selecting a scoring engine.
 * - Workspace-scored tests bypass code extraction/import entirely.
 * - Unexpected setup failures are returned as structured scoring results.
 */

import type { ScoringResult } from "../schemas/index.js";
import { scoreCodeModule } from "./code-module-scorer.js";
import { hasScoringSpec, loadScoringSpec } from "./scoring-spec.js";
import { scoreWorkspace } from "./workspace-scorer.js";

/** Default timeout for scoring (5 seconds). */
const DEFAULT_SCORING_TIMEOUT_MS = 5000;

/**
 * Scores one benchmark item in the current process.
 *
 * @param testSlug - Test directory name
 * @param rawOutput - Raw output from LLM generation
 * @param timeoutMs - Timeout for scoring
 * @param codeFilePath - Optional path to a generated code file
 * @param workspaceDir - Optional seeded workspace for filesystem tasks
 * @returns Scoring result with pass/fail counts
 */
export async function scoreGenerationInProcess(
	testSlug: string,
	rawOutput: string,
	timeoutMs: number = DEFAULT_SCORING_TIMEOUT_MS,
	codeFilePath?: string,
	workspaceDir?: string,
): Promise<ScoringResult> {
	if (!hasScoringSpec(testSlug)) {
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: "No scoring spec found",
			failureType: "no_spec",
		};
	}

	let spec: Awaited<ReturnType<typeof loadScoringSpec>>;
	try {
		spec = await loadScoringSpec(testSlug);
	} catch (error) {
		return {
			passed: 0,
			failed: 0,
			total: 0,
			error: `Failed to load scoring spec: ${error instanceof Error ? error.message : String(error)}`,
			failureType: "spec_load",
		};
	}

	if (spec.mode === "workspace") {
		if (!workspaceDir) {
			return {
				passed: 0,
				failed: 1,
				total: 1,
				error: `Workspace-scored test "${testSlug}" requires a workspace directory`,
				failureType: "test_execution",
			};
		}
		return scoreWorkspace(spec, workspaceDir);
	}

	return scoreCodeModule(testSlug, spec, rawOutput, timeoutMs, codeFilePath);
}
