/**
 * Purpose: Decide when planned benchmark combinations are incompatible.
 * Exports: resolveCombinationExclusion
 *
 * Invariants:
 * - Combination Exclusions are planning evidence, not Matrix Items.
 * - Missing tool harness support is reported before finer capability checks.
 */

import {
	type HarnessName,
	TOOL_CALLING_HARNESS_NAMES,
	doesHarnessSupportCapabilities,
} from "../harnesses/index.js";
import type { CombinationExclusion, MatrixItem } from "../schemas/index.js";
import type { TestDefinition } from "../schemas/test-catalog.schema.js";

/**
 * Resolves whether a planned runtime/harness/model/test combination is executable.
 *
 * @param input - Planned combination dimensions
 * @returns Combination Exclusion when incompatible, otherwise undefined
 */
export function resolveCombinationExclusion(input: {
	runtime: MatrixItem["runtime"];
	harness: HarnessName;
	model: string;
	test: TestDefinition;
}): CombinationExclusion | undefined {
	const { runtime, harness, model, test } = input;
	const base = {
		runtime,
		harness,
		model,
		test: test.slug,
		requiredHarnessCapabilities: test.requiredHarnessCapabilities,
	};

	if (
		test.requiresTools &&
		!TOOL_CALLING_HARNESS_NAMES.includes(
			harness as (typeof TOOL_CALLING_HARNESS_NAMES)[number],
		)
	) {
		return {
			...base,
			reason: "missing_tool_harness",
		};
	}

	if (
		test.requiredHarnessCapabilities.length > 0 &&
		!doesHarnessSupportCapabilities(harness, test.requiredHarnessCapabilities)
	) {
		return {
			...base,
			reason: "missing_harness_capability",
		};
	}

	return undefined;
}
