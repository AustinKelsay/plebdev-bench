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
import type { RuntimeName } from "../../schemas/common.schema.js";
import {
	ModelAliasFileSchema,
	type ModelAliasMap,
	ModelAliasMapSchema,
} from "../../schemas/model-alias.schema.js";
import {
	ModelProfileFileSchema,
	type ModelProfile,
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
		registry[profileKey] = {
			profileLabel: humanizeSlug(profileKey),
			family: profileKey,
			variants: Object.fromEntries(
				Object.entries(variants).map(([runtime, modelName]) => [runtime, modelName]),
			),
		};
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

	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		throw new Error(`Invalid JSON in model profile file: ${filePath}`);
	}

	const profileWrapper = ModelProfileFileSchema.safeParse(parsed);
	if (profileWrapper.success) {
		log.debug(
			{ profileCount: Object.keys(profileWrapper.data.models).length },
			"Loaded versioned model profile file",
		);
		return profileWrapper.data.models;
	}

	const rawProfiles = ModelProfileRegistrySchema.safeParse(parsed);
	if (rawProfiles.success) {
		log.debug(
			{ profileCount: Object.keys(rawProfiles.data).length },
			"Loaded raw model profiles",
		);
		return rawProfiles.data;
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
		const runtime = entry.slice(0, colonIndex).trim();
		const modelName = entry.slice(colonIndex + 1).trim();
		if (!runtime || !modelName) {
			throw new Error(
				`Invalid runtime mapping in profile "${profileKey}": "${entry}"`,
			);
		}
		variants[runtime] = modelName;
	}

	return {
		[profileKey]: {
			profileLabel: humanizeSlug(profileKey),
			family: profileKey,
			variants,
		},
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
	runtime: RuntimeName,
	runtimeModelName: string,
	registry: ModelProfileRegistry,
): { profileKey: string; profile: ModelProfileRegistry[string] } | undefined {
	for (const [profileKey, profile] of Object.entries(registry)) {
		const configuredVariant = profile.variants[runtime];
		if (!configuredVariant) continue;
		const normalized = normalizeConfiguredVariant(configuredVariant);
		if (normalized.modelName === runtimeModelName) {
			return { profileKey, profile };
		}
	}

	return undefined;
}

/**
 * Builds a resolved profile for a runtime model name, preferring configured metadata.
 *
 * @param runtime - Runtime containing the model
 * @param runtimeModelName - Runtime-specific model identifier
 * @param registry - Configured model-profile registry
 * @returns Resolved model profile
 */
export function buildResolvedModelProfile(
	runtime: RuntimeName,
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
			? { profileKey: configured.profileKey, profile: configured.profile }
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
 */
export function resolveModelSelection(
	modelSpec: string,
	runtime: RuntimeName,
	registry: ModelProfileRegistry,
): ResolvedModelSelection | undefined {
	const configuredProfile = registry[modelSpec];
	if (configuredProfile) {
		const configuredVariant = configuredProfile.variants[runtime];
		if (!configuredVariant) {
			return undefined;
		}

		const normalizedVariant = normalizeConfiguredVariant(configuredVariant);
		const resolutionSource: ModelProfile["resolutionSource"] =
			Object.values(configuredProfile.variants).every(
				(value) => typeof value === "string",
			)
				? "legacy_alias"
				: "configured_profile";

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
				resolutionSource: "configured_profile",
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
