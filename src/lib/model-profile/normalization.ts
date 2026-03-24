/**
 * Purpose: Normalize canonical model identities and runtime-specific variants.
 * Exports: buildResolvedModelProfile, buildConfiguredModelProfile,
 *          buildFallbackModelProfile, normalizeConfiguredVariant,
 *          humanizeSlug, getModelIdentityKey
 *
 * Invariants:
 * - Canonical identity should remain stable across runtime-specific names
 * - Runtime variant metadata preserves the exact artifact used for execution
 * - Heuristic fallback preserves raw names when no configured profile exists
 */

import type { RuntimeName } from "../../schemas/common.schema.js";
import type {
	ConfiguredModelProfile,
	ConfiguredModelVariantValue,
	ModelProfile,
} from "../../schemas/index.js";

/** Lowercase slug helper used for stable profile and variant keys. */
function toSlug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

/** Formats numeric values without insignificant trailing zeroes. */
function formatCompactNumber(value: number): string {
	return Number.isInteger(value)
		? String(value)
		: value.toFixed(1).replace(/\.0$/, "");
}

/** Converts a slug-like token into a simple human-readable label. */
export function humanizeSlug(value: string): string {
	return value
		.split(/[-_]+/)
		.filter((token) => token.length > 0)
		.map((token) =>
			/^\d+$/.test(token)
				? token
				: token.charAt(0).toUpperCase() + token.slice(1),
		)
		.join(" ");
}

/** Parses a parameter scale from a raw model identifier when present. */
function detectParametersBillions(value: string): number | undefined {
	const billionsMatch = value.match(
		/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*b(?:[^a-z0-9]|$)/i,
	);
	if (billionsMatch) {
		const parsed = Number.parseFloat(billionsMatch[1]);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	const millionsMatch = value.match(
		/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*m(?:[^a-z0-9]|$)/i,
	);
	if (millionsMatch) {
		const parsed = Number.parseFloat(millionsMatch[1]);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed / 1000;
		}
	}

	return undefined;
}

/** Detects quantization tags from a raw runtime model name. */
function detectQuantization(value: string): string | undefined {
	const normalized = value.toLowerCase();
	const quantizationPatterns = [
		/q\d(?:_\d)?(?:_[a-z]+)*/i,
		/\b\d(?:\.\d+)?-?bit\b/i,
		/\b(?:awq|gptq|fp16|bf16|int4|int8|fp8)\b/i,
	];

	for (const pattern of quantizationPatterns) {
		const match = normalized.match(pattern);
		if (match) {
			return match[0].toUpperCase();
		}
	}

	return undefined;
}

/** Detects common model artifact formats from a raw runtime model name. */
function detectFormat(value: string): string | undefined {
	const normalized = value.toLowerCase();
	if (normalized.includes("gguf")) return "GGUF";
	if (normalized.includes("mlx")) return "MLX";
	if (normalized.includes("safetensors")) return "safetensors";
	return undefined;
}

/** Detects common tuning suffixes that should stay in the canonical profile. */
function detectTuning(value: string): string | undefined {
	const normalized = value.toLowerCase();
	const tuningPatterns = ["instruct", "chat", "coder", "vision", "reasoning"];
	return tuningPatterns.find((pattern) => normalized.includes(pattern));
}

/** Breaks a raw model identifier into lower-case tokens for heuristic grouping. */
function tokenizeModelName(value: string): string[] {
	const basename =
		value
			.split(/[\\/]/)
			.at(-1)
			?.replace(/\.(gguf|bin|safetensors)$/i, "") ?? value;
	return basename
		.toLowerCase()
		.split(/[^a-z0-9.]+/)
		.filter((token) => token.length > 0);
}

/** Determines whether a token is primarily a parameter scale marker. */
function isParameterToken(token: string): boolean {
	return /^\d+(?:\.\d+)?[bm]$/.test(token);
}

/** Determines whether a token is deployment metadata rather than canonical identity. */
function isVariantOnlyToken(token: string): boolean {
	return [
		"gguf",
		"mlx",
		"awq",
		"gptq",
		"fp16",
		"bf16",
		"fp8",
		"int4",
		"int8",
	].includes(token);
}

/** Derives a family slug from a runtime model name when no configured profile exists. */
function deriveFamily(value: string): string {
	const tokens = tokenizeModelName(value);
	const familyTokens: string[] = [];

	for (const token of tokens) {
		if (isParameterToken(token) || isVariantOnlyToken(token)) {
			break;
		}
		if (["instruct", "chat", "coder", "vision", "reasoning"].includes(token)) {
			break;
		}
		familyTokens.push(token);
	}

	if (familyTokens.length === 0) {
		return toSlug(tokens[0] ?? value);
	}

	return toSlug(familyTokens.join("-"));
}

/** Builds the stable canonical profile key. */
function buildCanonicalProfileKey(
	family: string,
	parametersBillions: number | undefined,
	tuning: string | undefined,
): string {
	return [
		toSlug(family),
		parametersBillions !== undefined
			? `${formatCompactNumber(parametersBillions)}b`
			: undefined,
		tuning ? toSlug(tuning) : undefined,
	]
		.filter((part): part is string => part !== undefined && part.length > 0)
		.join("-");
}

/** Builds a display label for the canonical profile. */
function buildCanonicalProfileLabel(
	family: string,
	parametersBillions: number | undefined,
	tuning: string | undefined,
): string {
	return [
		humanizeSlug(family),
		parametersBillions !== undefined
			? `${formatCompactNumber(parametersBillions)}B`
			: undefined,
		tuning ? humanizeSlug(tuning) : undefined,
	]
		.filter((part): part is string => part !== undefined && part.length > 0)
		.join(" ");
}

/** Resolves a configured variant definition from either shorthand or object form. */
export function normalizeConfiguredVariant(
	value: ConfiguredModelVariantValue,
): {
	modelName: string;
	variantLabel?: string;
	format?: string;
	quantization?: string;
	sourceId?: string;
} {
	return typeof value === "string" ? { modelName: value } : value;
}

/** Builds a resolved model profile from configured metadata. */
export function buildConfiguredModelProfile(args: {
	profileKey: string;
	profile: ConfiguredModelProfile;
	runtime: RuntimeName;
	runtimeModelName: string;
	resolutionSource: ModelProfile["resolutionSource"];
}): ModelProfile {
	const configuredVariant = normalizeConfiguredVariant(
		args.profile.variants[args.runtime],
	);
	const family = args.profile.family ?? args.profileKey;
	const parametersBillions =
		args.profile.parametersBillions ??
		detectParametersBillions(configuredVariant.modelName);
	const tuning =
		args.profile.tuning ?? detectTuning(configuredVariant.modelName);

	return {
		canonical: {
			profileKey: args.profileKey,
			profileLabel:
				args.profile.profileLabel ??
				buildCanonicalProfileLabel(family, parametersBillions, tuning),
			family,
			...(parametersBillions !== undefined ? { parametersBillions } : {}),
			...(args.profile.parameterScaleLabel
				? { parameterScaleLabel: args.profile.parameterScaleLabel }
				: parametersBillions !== undefined
					? { parameterScaleLabel: `${formatCompactNumber(parametersBillions)}B` }
					: {}),
			...(args.profile.provider ? { provider: args.profile.provider } : {}),
			...(tuning ? { tuning } : {}),
		},
		variant: {
			variantKey: toSlug(`${args.runtime}-${args.runtimeModelName}`),
			variantLabel: configuredVariant.variantLabel ?? args.runtimeModelName,
			runtime: args.runtime,
			runtimeModelName: args.runtimeModelName,
			...(configuredVariant.format ? { format: configuredVariant.format } : {}),
			...(configuredVariant.quantization
				? { quantization: configuredVariant.quantization }
				: {}),
			...(configuredVariant.sourceId ? { sourceId: configuredVariant.sourceId } : {}),
		},
		resolutionSource: args.resolutionSource,
	};
}

/** Builds a heuristic model profile when no configured mapping exists. */
export function buildFallbackModelProfile(
	runtime: RuntimeName,
	runtimeModelName: string,
): ModelProfile {
	const family = deriveFamily(runtimeModelName);
	const parametersBillions = detectParametersBillions(runtimeModelName);
	const tuning = detectTuning(runtimeModelName);
	const format = detectFormat(runtimeModelName);
	const quantization = detectQuantization(runtimeModelName);

	return {
		canonical: {
			profileKey: buildCanonicalProfileKey(family, parametersBillions, tuning),
			profileLabel: buildCanonicalProfileLabel(
				family,
				parametersBillions,
				tuning,
			),
			family,
			...(parametersBillions !== undefined ? { parametersBillions } : {}),
			...(parametersBillions !== undefined
				? { parameterScaleLabel: `${formatCompactNumber(parametersBillions)}B` }
				: {}),
			...(tuning ? { tuning } : {}),
		},
		variant: {
			variantKey: toSlug(`${runtime}-${runtimeModelName}`),
			variantLabel: runtimeModelName,
			runtime,
			runtimeModelName,
			...(format ? { format } : {}),
			...(quantization ? { quantization } : {}),
		},
		resolutionSource: "runtime_name",
	};
}

/**
 * Builds a resolved profile for a runtime model name, preferring configured metadata.
 *
 * @param runtime - Runtime containing the model
 * @param runtimeModelName - Runtime-specific model identifier
 * @param profileKey - Optional matched configured profile key
 * @param profile - Optional matched configured profile
 * @returns Resolved model profile
 */
export function buildResolvedModelProfile(args: {
	runtime: RuntimeName;
	runtimeModelName: string;
	profileKey?: string;
	profile?: ConfiguredModelProfile;
}): ModelProfile {
	if (args.profileKey && args.profile) {
		return buildConfiguredModelProfile({
			profileKey: args.profileKey,
			profile: args.profile,
			runtime: args.runtime,
			runtimeModelName: args.runtimeModelName,
			resolutionSource: "configured_profile",
		});
	}

	return buildFallbackModelProfile(args.runtime, args.runtimeModelName);
}

/**
 * Returns the canonical identity key used for cross-run model matching.
 *
 * @param model - Runtime model name
 * @param modelProfile - Canonical model profile when available
 * @param modelAlias - Deprecated alias field retained in some artifacts
 * @returns Stable model identity key
 */
export function getModelIdentityKey(
	model: string,
	modelProfile?: ModelProfile,
	modelAlias?: string,
): string {
	return modelProfile?.canonical.profileKey ?? modelAlias ?? model;
}
