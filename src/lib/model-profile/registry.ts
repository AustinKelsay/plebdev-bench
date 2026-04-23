/**
 * Purpose: Load and resolve configured model-profile registries.
 * Exports: loadModelProfiles, parseInlineModelProfile, parseInlineModelProfiles,
 *          mergeModelProfiles, resolveModelSelection, buildResolvedModelProfile
 *
 * Invariants:
 * - New model-profile registries and legacy alias maps are both accepted
 * - Canonical profile keys are stable across runtime-specific model names
 * - Unconfigured runtime model names still receive heuristic fallback profiles
 */

import * as fs from "node:fs";
import {
	type SupportedRuntimeName,
	SupportedRuntimeNameSchema,
} from "../../schemas/common.schema.js";
import {
	ModelAliasFileSchema,
	type ModelAliasMap,
	ModelAliasMapSchema,
} from "../../schemas/model-alias.schema.js";
import {
	type ModelProfile,
	ModelProfileFileSchema,
	type ModelProfileRegistry,
	ModelProfileRegistrySchema,
} from "../../schemas/model-profile.schema.js";
import { logger } from "../logger.js";
import {
	buildConfiguredModelProfile,
	buildResolvedModelProfile as buildResolvedProfile,
	humanizeSlug,
	normalizeConfiguredVariant,
} from "./normalization.js";
import {
	LegacyCompatibleModelProfileFileSchema,
	LegacyCompatibleModelProfileRegistrySchema,
	normalizeLoadedModelProfileRegistry,
} from "./registry-compat.js";

const REGISTRY_PROVENANCE = Symbol("modelProfileRegistryProvenance");

type RegistryResolutionSource = Extract<
	ModelProfile["resolutionSource"],
	"configured_profile" | "legacy_alias"
>;
type RegistryProfile = ModelProfileRegistry[string] & {
	[REGISTRY_PROVENANCE]?: RegistryResolutionSource;
};

/** Attaches explicit provenance metadata to a configured profile entry. */
function withRegistryProfileProvenance(
	profile: ModelProfileRegistry[string],
	provenance: RegistryResolutionSource,
): RegistryProfile {
	const decorated = { ...profile } as RegistryProfile;
	Object.defineProperty(decorated, REGISTRY_PROVENANCE, {
		value: provenance,
		enumerable: true,
		configurable: true,
	});
	return decorated;
}

/** Applies shared provenance to every registry entry. */
function withRegistryProvenance(
	registry: ModelProfileRegistry,
	provenance: RegistryResolutionSource,
): ModelProfileRegistry {
	return Object.fromEntries(
		Object.entries(registry).map(([profileKey, profile]) => [
			profileKey,
			withRegistryProfileProvenance(profile, provenance),
		]),
	);
}

/** Reads explicit provenance from a configured profile entry. */
function getRegistryProfileProvenance(
	profile: ModelProfileRegistry[string],
): RegistryResolutionSource {
	return (
		(profile as RegistryProfile)[REGISTRY_PROVENANCE] ?? "configured_profile"
	);
}

/** Resolved runtime-specific model selection for one matrix row. */
export interface ResolvedModelSelection {
	runtimeModelName: string;
	modelAlias?: string;
	modelProfile: ModelProfile;
}

/** Normalizes a legacy alias map into the richer model-profile registry shape. */
function normalizeLegacyAliasMap(aliases: ModelAliasMap): ModelProfileRegistry {
	const registry: ModelProfileRegistry = {};

	for (const [profileKey, variants] of Object.entries(aliases)) {
		registry[profileKey] = withRegistryProfileProvenance(
			{
				profileLabel: humanizeSlug(profileKey),
				variants: Object.fromEntries(
					Object.entries(variants).map(([runtime, modelName]) => [
						runtime,
						modelName,
					]),
				),
			},
			"legacy_alias",
		);
	}

	return registry;
}

/**
 * Loads model profiles from JSON.
 *
 * Accepts:
 * - new versioned profile files: `{ schemaVersion, models }`
 * - raw profile registries
 * - legacy alias wrappers: `{ schemaVersion, aliases }`
 * - raw legacy alias maps
 *
 * @param filePath - JSON file path
 * @returns Parsed model-profile registry
 * @throws {Error} On missing/invalid files
 */
export function loadModelProfiles(filePath: string): ModelProfileRegistry {
	const log = logger.child({ module: "model-profiles", filePath });

	if (!fs.existsSync(filePath)) {
		throw new Error(`Model profile file not found: ${filePath}`);
	}

	let fileContents: string;
	try {
		fileContents = fs.readFileSync(filePath, "utf-8");
	} catch (error) {
		throw new Error(
			`Failed to read model profile file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(fileContents);
	} catch {
		throw new Error(`Invalid JSON in model profile file: ${filePath}`);
	}

	const profileWrapper = ModelProfileFileSchema.safeParse(parsed);
	if (profileWrapper.success) {
		const normalized = normalizeLoadedModelProfileRegistry(
			LegacyCompatibleModelProfileRegistrySchema.parse(
				profileWrapper.data.models,
			),
			log,
		);
		log.debug(
			{ profileCount: Object.keys(normalized).length },
			"Loaded versioned model profile file",
		);
		return withRegistryProvenance(normalized, "configured_profile");
	}

	const legacyCompatibleProfileWrapper =
		LegacyCompatibleModelProfileFileSchema.safeParse(parsed);
	if (legacyCompatibleProfileWrapper.success) {
		const normalized = normalizeLoadedModelProfileRegistry(
			legacyCompatibleProfileWrapper.data.models,
			log,
		);
		log.debug(
			{ profileCount: Object.keys(normalized).length },
			"Loaded legacy-compatible model profile file",
		);
		return withRegistryProvenance(normalized, "configured_profile");
	}

	const rawProfiles = ModelProfileRegistrySchema.safeParse(parsed);
	if (rawProfiles.success) {
		log.debug(
			{ profileCount: Object.keys(rawProfiles.data).length },
			"Loaded raw model profiles",
		);
		return withRegistryProvenance(rawProfiles.data, "configured_profile");
	}

	const legacyCompatibleRawProfiles =
		LegacyCompatibleModelProfileRegistrySchema.safeParse(parsed);
	if (legacyCompatibleRawProfiles.success) {
		const normalized = normalizeLoadedModelProfileRegistry(
			legacyCompatibleRawProfiles.data,
			log,
		);
		log.debug(
			{ profileCount: Object.keys(normalized).length },
			"Loaded legacy-compatible raw model profiles",
		);
		return withRegistryProvenance(normalized, "configured_profile");
	}

	const aliasWrapper = ModelAliasFileSchema.safeParse(parsed);
	if (aliasWrapper.success) {
		const normalized = normalizeLegacyAliasMap(aliasWrapper.data.aliases);
		log.debug(
			{ profileCount: Object.keys(normalized).length },
			"Loaded legacy alias wrapper as model profiles",
		);
		return normalized;
	}

	const rawAliases = ModelAliasMapSchema.safeParse(parsed);
	if (rawAliases.success) {
		const normalized = normalizeLegacyAliasMap(rawAliases.data);
		log.debug(
			{ profileCount: Object.keys(normalized).length },
			"Loaded legacy alias map as model profiles",
		);
		return normalized;
	}

	throw new Error(`Invalid model profile format in ${filePath}`);
}

/**
 * Parses inline alias shorthand into the richer model-profile registry shape.
 *
 * Format: `profile=runtime:model,runtime:model`
 *
 * @param inline - Inline profile shorthand
 * @returns Registry containing a single configured profile
 * @throws {Error} When the input format is invalid
 */
export function parseInlineModelProfile(inline: string): ModelProfileRegistry {
	const eqIndex = inline.indexOf("=");
	if (eqIndex === -1) {
		throw new Error(
			`Invalid inline model profile format: "${inline}". Expected "profile=runtime:model,runtime:model"`,
		);
	}

	const profileKey = inline.slice(0, eqIndex).trim();
	const mappings = inline.slice(eqIndex + 1).trim();
	if (!profileKey || !mappings) {
		throw new Error(
			`Invalid inline model profile format: "${inline}". Both profile key and mappings are required.`,
		);
	}

	const variants: Record<string, string> = {};
	for (const entry of mappings.split(",")) {
		const colonIndex = entry.indexOf(":");
		if (colonIndex === -1) {
			throw new Error(
				`Invalid runtime mapping in profile "${profileKey}": "${entry}"`,
			);
		}
		const runtimeInput = entry.slice(0, colonIndex).trim();
		const modelName = entry.slice(colonIndex + 1).trim();
		if (!runtimeInput || !modelName) {
			throw new Error(
				`Invalid runtime mapping in profile "${profileKey}": "${entry}"`,
			);
		}
		const runtimeResult = SupportedRuntimeNameSchema.safeParse(runtimeInput);
		if (!runtimeResult.success) {
			throw new Error(
				`Invalid runtime mapping in profile "${profileKey}": unknown runtime "${runtimeInput}"`,
			);
		}
		const runtime = runtimeResult.data;
		if (variants[runtime] !== undefined) {
			throw new Error(
				`Invalid runtime mapping in profile "${profileKey}": duplicate runtime "${runtime}"`,
			);
		}
		variants[runtime] = modelName;
	}

	return {
		[profileKey]: withRegistryProfileProvenance(
			{
				profileLabel: humanizeSlug(profileKey),
				variants,
			},
			"configured_profile",
		),
	};
}

/**
 * Parses multiple inline model-profile shorthands.
 *
 * @param inlines - Inline definitions
 * @returns Combined model-profile registry
 */
export function parseInlineModelProfiles(
	inlines: string[],
): ModelProfileRegistry {
	return mergeModelProfiles(
		...inlines.map((inline) => parseInlineModelProfile(inline)),
	);
}

/**
 * Merges multiple model-profile registries with later definitions taking precedence.
 *
 * @param registries - Registries to merge
 * @returns Combined registry
 */
export function mergeModelProfiles(
	...registries: ModelProfileRegistry[]
): ModelProfileRegistry {
	const merged: ModelProfileRegistry = {};

	for (const registry of registries) {
		for (const [profileKey, profile] of Object.entries(registry)) {
			const existing = merged[profileKey];
			merged[profileKey] = existing
				? {
						...existing,
						...profile,
						variants: { ...existing.variants, ...profile.variants },
					}
				: {
						...profile,
						variants: { ...profile.variants },
					};
		}
	}

	return merged;
}

/** Searches for a configured profile by runtime-specific model name. */
function findConfiguredVariantByRuntimeModel(
	runtime: SupportedRuntimeName,
	runtimeModelName: string,
	registry: ModelProfileRegistry,
): { profileKey: string; profile: ModelProfileRegistry[string] } | undefined {
	const matches: Array<{
		profileKey: string;
		profile: ModelProfileRegistry[string];
	}> = [];
	for (const [profileKey, profile] of Object.entries(registry)) {
		const configuredVariant = profile.variants[runtime];
		if (!configuredVariant) continue;
		const normalized = normalizeConfiguredVariant(configuredVariant);
		if (normalized.modelName === runtimeModelName) {
			matches.push({ profileKey, profile });
		}
	}

	if (matches.length === 0) {
		return undefined;
	}
	if (matches.length === 1) {
		return matches[0];
	}
	throw new Error(
		`Ambiguous configured model profile reverse match for runtime "${runtime}" and model "${runtimeModelName}": ${matches.map((match) => match.profileKey).join(", ")}`,
	);
}

/**
 * Builds a resolved profile for a runtime model name, preferring configured metadata.
 *
 * @param runtime - Runtime containing the model
 * @param runtimeModelName - Runtime-specific model identifier
 * @param registry - Configured model-profile registry
 * @returns Resolved model profile
 * @throws {Error} If `findConfiguredVariantByRuntimeModel` finds multiple
 * configured profiles for the same runtime/runtimeModelName mapping
 */
export function buildResolvedModelProfile(
	runtime: SupportedRuntimeName,
	runtimeModelName: string,
	registry: ModelProfileRegistry,
): ModelProfile {
	const configured = findConfiguredVariantByRuntimeModel(
		runtime,
		runtimeModelName,
		registry,
	);
	return buildResolvedProfile({
		runtime,
		runtimeModelName,
		...(configured
			? {
					profileKey: configured.profileKey,
					profile: configured.profile,
					resolutionSource: getRegistryProfileProvenance(configured.profile),
				}
			: {}),
	});
}

/**
 * Resolves a user-specified model selector into a runtime model plus canonical profile.
 *
 * `modelSpec` may be either:
 * - a canonical profile key from the registry
 * - a runtime-specific model name
 *
 * @param modelSpec - User-specified model selector
 * @param runtime - Target runtime
 * @param registry - Configured model-profile registry
 * @returns Resolved runtime model and profile, or undefined if the profile lacks a mapping for this runtime
 * @throws {Error} If `findConfiguredVariantByRuntimeModel` finds multiple
 * configured profiles for the same runtime/runtimeModelName mapping
 */
export function resolveModelSelection(
	modelSpec: string,
	runtime: SupportedRuntimeName,
	registry: ModelProfileRegistry,
): ResolvedModelSelection | undefined {
	const configuredProfile = registry[modelSpec];
	if (configuredProfile) {
		const configuredVariant = configuredProfile.variants[runtime];
		if (!configuredVariant) {
			return undefined;
		}

		const normalizedVariant = normalizeConfiguredVariant(configuredVariant);
		const resolutionSource = getRegistryProfileProvenance(configuredProfile);

		return {
			runtimeModelName: normalizedVariant.modelName,
			modelAlias: modelSpec,
			modelProfile: buildConfiguredModelProfile({
				profileKey: modelSpec,
				profile: configuredProfile,
				runtime,
				runtimeModelName: normalizedVariant.modelName,
				resolutionSource,
			}),
		};
	}

	const reverseMatch = findConfiguredVariantByRuntimeModel(
		runtime,
		modelSpec,
		registry,
	);
	if (reverseMatch) {
		return {
			runtimeModelName: modelSpec,
			modelAlias: reverseMatch.profileKey,
			modelProfile: buildConfiguredModelProfile({
				profileKey: reverseMatch.profileKey,
				profile: reverseMatch.profile,
				runtime,
				runtimeModelName: modelSpec,
				resolutionSource: getRegistryProfileProvenance(reverseMatch.profile),
			}),
		};
	}

	return {
		runtimeModelName: modelSpec,
		modelProfile: buildResolvedProfile({
			runtime,
			runtimeModelName: modelSpec,
		}),
	};
}
