/**
 * Purpose: Public entrypoint for model-profile loading and resolution helpers.
 * Exports: loadModelProfiles, parseInlineModelProfile, parseInlineModelProfiles,
 *          mergeModelProfiles, resolveModelSelection, buildResolvedModelProfile,
 *          getModelIdentityKey
 *
 * Invariants:
 * - Exported API names remain stable for callers importing shared model-profile helpers
 * - Loading and resolution are deterministic for the same config and runtime inputs
 * - Helpers have no global side effects beyond explicit filesystem reads in loader functions
 * - Invalid config and ambiguous runtime mappings fail fast with descriptive errors
 */

export {
	loadModelProfiles,
	parseInlineModelProfile,
	parseInlineModelProfiles,
	mergeModelProfiles,
	resolveModelSelection,
	buildResolvedModelProfile,
	type ResolvedModelSelection,
} from "./model-profile/registry.js";

export { getModelIdentityKey } from "./model-profile/normalization.js";
