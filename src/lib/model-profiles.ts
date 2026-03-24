/**
 * Purpose: Public entrypoint for model-profile loading and resolution helpers.
 * Exports: loadModelProfiles, parseInlineModelProfile, parseInlineModelProfiles,
 *          mergeModelProfiles, resolveModelSelection, buildResolvedModelProfile,
 *          getModelIdentityKey
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
