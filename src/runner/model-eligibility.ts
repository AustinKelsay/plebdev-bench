/**
 * Purpose: Filter runtime models to those eligible for generative benchmark rows.
 * Exports: filterGenerativeModels
 *
 * Invariants:
 * - Non-generative discovered models are recorded, not benchmarked.
 * - Metadata lookup failures keep existing permissive behavior with a warning.
 */

import type { ModelInfo, Runtime, RuntimeName } from "../runtimes/index.js";
import type { ModelExclusion } from "../schemas/index.js";

interface EligibilityLogger {
	warn: (obj: Record<string, unknown>, msg?: string) => void;
}

interface FilterGenerativeModelsInput {
	runtimeName: RuntimeName;
	runtime: Runtime;
	models: string[];
	mode: "record" | "throw";
	log: EligibilityLogger;
}

interface FilterGenerativeModelsResult {
	models: string[];
	exclusions: ModelExclusion[];
}

/**
 * Builds evidence for model exclusion from runtime metadata.
 *
 * @param info - Runtime model metadata
 * @returns Evidence object accepted by RunPlan schema
 */
function buildExclusionEvidence(info: ModelInfo): ModelExclusion["evidence"] {
	return {
		...(info.metadata?.family ? { family: info.metadata.family } : {}),
		...(info.metadata?.families ? { families: info.metadata.families } : {}),
		...(info.metadata?.architecture
			? { architecture: info.metadata.architecture }
			: {}),
	};
}

/**
 * Returns true when metadata says the model can generate text.
 *
 * @param info - Runtime model metadata
 * @returns True when the model should be included in generative rows
 */
function canGenerateText(info: ModelInfo): boolean {
	return info.capabilities?.generateText ?? info.modelKind !== "embedding";
}

/**
 * Filters embedding-only models before matrix expansion.
 *
 * @param input - Runtime and candidate model list
 * @returns Eligible models plus exclusions for plan metadata
 * @throws Error when mode is "throw" and an explicit model is non-generative
 */
export async function filterGenerativeModels(
	input: FilterGenerativeModelsInput,
): Promise<FilterGenerativeModelsResult> {
	const eligibleModels: string[] = [];
	const exclusions: ModelExclusion[] = [];

	for (const model of input.models) {
		let info: ModelInfo;
		try {
			info = await input.runtime.getModelInfo(model);
		} catch (error) {
			input.log.warn(
				{ runtime: input.runtimeName, model, error },
				"Failed to classify model capabilities; assuming text generation support",
			);
			eligibleModels.push(model);
			continue;
		}

		if (canGenerateText(info)) {
			eligibleModels.push(model);
			continue;
		}

		const exclusion: ModelExclusion = {
			runtime: input.runtimeName,
			model,
			reason: "non_generative_model",
			evidence: buildExclusionEvidence(info),
		};

		if (input.mode === "throw") {
			throw new Error(
				`Requested model is not supported for generative benchmarks: ${model} (embedding-only)`,
			);
		}

		exclusions.push(exclusion);
	}

	return {
		models: eligibleModels,
		exclusions,
	};
}
