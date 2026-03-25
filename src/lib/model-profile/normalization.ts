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

const TUNING_PATTERNS = [
	"instruct",
	"chat",
	"coder",
	"vision",
	"reasoning",
] as const;

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

/**
 * Converts a slug-like identifier into a compact human-readable label.
 *
 * @param value - Slug or tokenized identifier such as `qwen3-27b-instruct`
 * @returns Space-separated label with simple capitalization applied
 */
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
	if (normalized.includes("gguf")) return "gguf";
	if (normalized.includes("mlx")) return "mlx";
	if (normalized.includes("safetensors")) return "safetensors";
	return undefined;
}

/** Detects common tuning suffixes that should stay in the canonical profile. */
function detectTuning(value: string): string | undefined {
	const normalized = value.toLowerCase();
	return TUNING_PATTERNS.find((pattern) => normalized.includes(pattern));
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
		if (
			(TUNING_PATTERNS as readonly string[]).includes(token)
		) {
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

/**
 * Resolves a configured model variant from shorthand or expanded object form.
 *
 * @param value - Configured variant value from the model-profile registry
 * @returns Normalized object containing runtime model name and optional metadata
 */
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

/**
 * Builds a resolved model profile from an explicit configured registry entry.
 *
 * @param args - Configured profile key, profile payload, runtime, and runtime model name
 * @returns Canonical profile plus runtime-specific variant metadata
 * @throws {Error} When the configured profile does not define the requested runtime variant
 */
export function buildConfiguredModelProfile(args: {
	profileKey: string;
	profile: ConfiguredModelProfile;
	runtime: RuntimeName;
	runtimeModelName: string;
	resolutionSource: ModelProfile["resolutionSource"];
}): ModelProfile {
	const rawConfiguredVariant = args.profile.variants[args.runtime];
	if (rawConfiguredVariant === undefined) {
		throw new Error(
			`Configured model profile "${args.profileKey}" does not define a variant for runtime "${args.runtime}"`,
		);
	}
	const configuredVariant = normalizeConfiguredVariant(rawConfiguredVariant);
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

/**
 * Builds a heuristic model profile when no configured mapping exists.
 *
 * @param runtime - Runtime that will execute the model
 * @param runtimeModelName - Raw runtime-specific model identifier
 * @returns Heuristically derived canonical profile and runtime-specific variant metadata
 */
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
 * @throws {Error} When only one of `profileKey` or `profile` is provided
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

	if (args.profileKey || args.profile) {
		throw new Error(
			`Invalid configured model-profile resolution for runtime "${args.runtime}" and model "${args.runtimeModelName}": profileKey and profile must either both be provided or both be omitted`,
		);
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
