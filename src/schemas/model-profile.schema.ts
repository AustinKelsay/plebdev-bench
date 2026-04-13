/**
 * Purpose: Canonical model-profile schemas for grouping runtime-specific variants.
 * Exports: ModelProfileSchema, ModelProfile, ConfiguredModelVariantSchema,
 *          ConfiguredModelProfileSchema, ModelProfileRegistrySchema,
 *          ModelProfileFileSchema
 *
 * Model profiles separate stable model identity from runtime-specific deployment
 * details so runs can group "the same model" across quantizations, formats, and
 * runtimes while still preserving the exact artifact that executed.
 */

import { z } from "zod";
import {
	ArtifactRuntimeNameSchema,
	SCHEMA_VERSION,
	SupportedRuntimeNameSchema,
} from "./common.schema.js";

/** Valid sources used to resolve a model profile for a run item. */
export const modelProfileResolutionSources = [
	"configured_profile",
	"legacy_alias",
	"runtime_name",
] as const;

/** Model-profile resolution source schema. */
export const ModelProfileResolutionSourceSchema = z.enum(
	modelProfileResolutionSources,
);

/** Model-profile resolution source type. */
export type ModelProfileResolutionSource = z.infer<
	typeof ModelProfileResolutionSourceSchema
>;

/** Runtime-agnostic canonical model identity shared by all variants. */
export const CanonicalModelProfileSchema = z.object({
	profileKey: z.string().trim().min(1),
	profileLabel: z.string().trim().min(1),
	family: z.string().trim().min(1),
	parametersBillions: z.number().positive().optional(),
	parameterScaleLabel: z.string().trim().min(1).optional(),
	provider: z.string().trim().min(1).optional(),
	tuning: z.string().trim().min(1).optional(),
});

/** Canonical model identity type. */
export type CanonicalModelProfile = z.infer<
	typeof CanonicalModelProfileSchema
>;

/** Runtime-specific model variant metadata captured in a run artifact. */
export const ModelVariantSchema = z.object({
	variantKey: z.string().trim().min(1),
	variantLabel: z.string().trim().min(1),
	runtime: ArtifactRuntimeNameSchema,
	runtimeModelName: z.string().trim().min(1),
	format: z.string().trim().min(1).optional(),
	quantization: z.string().trim().min(1).optional(),
	sourceId: z.string().trim().min(1).optional(),
});

/** Runtime-specific model variant type. */
export type ModelVariant = z.infer<typeof ModelVariantSchema>;

/** Resolved model profile snapshot stored on plan/result artifacts. */
export const ModelProfileSchema = z.object({
	canonical: CanonicalModelProfileSchema,
	variant: ModelVariantSchema,
	resolutionSource: ModelProfileResolutionSourceSchema,
});

/** Resolved model profile snapshot type. */
export type ModelProfile = z.infer<typeof ModelProfileSchema>;

/** Configured runtime-specific variant metadata. */
export const ConfiguredModelVariantSchema = z.object({
	modelName: z.string().trim().min(1),
	variantLabel: z.string().trim().min(1).optional(),
	format: z.string().trim().min(1).optional(),
	quantization: z.string().trim().min(1).optional(),
	sourceId: z.string().trim().min(1).optional(),
});

/** Configured runtime-specific variant type. */
export type ConfiguredModelVariant = z.infer<
	typeof ConfiguredModelVariantSchema
>;

/** Configured runtime mapping value. Supports shorthand strings for legacy aliases. */
export const ConfiguredModelVariantValueSchema = z.union([
	z.string().trim().min(1),
	ConfiguredModelVariantSchema,
]);

/** Configured runtime mapping value type. */
export type ConfiguredModelVariantValue = z.infer<
	typeof ConfiguredModelVariantValueSchema
>;

/** Configured canonical model profile with runtime-specific variants. */
export const ConfiguredModelProfileSchema = z.object({
	profileLabel: z.string().trim().min(1).optional(),
	family: z.string().trim().min(1).optional(),
	parametersBillions: z.number().positive().optional(),
	parameterScaleLabel: z.string().trim().min(1).optional(),
	provider: z.string().trim().min(1).optional(),
	tuning: z.string().trim().min(1).optional(),
	variants: z.record(
		SupportedRuntimeNameSchema,
		ConfiguredModelVariantValueSchema,
	),
});

/** Configured canonical model profile type. */
export type ConfiguredModelProfile = z.infer<
	typeof ConfiguredModelProfileSchema
>;

/** Registry of canonical profile keys to configured model profiles. */
export const ModelProfileRegistrySchema = z.record(
	z.string().trim().min(1),
	ConfiguredModelProfileSchema,
);

/** Registry of configured model profiles. */
export type ModelProfileRegistry = z.infer<typeof ModelProfileRegistrySchema>;

/** Versioned model-profile file wrapper. */
export const ModelProfileFileSchema = z.object({
	schemaVersion: z.literal(SCHEMA_VERSION),
	models: ModelProfileRegistrySchema,
});

/** Persisted model-profile file type. */
export type ModelProfileFile = z.infer<typeof ModelProfileFileSchema>;
