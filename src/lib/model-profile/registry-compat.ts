/**
 * Purpose: Compatibility loaders for legacy model-profile registry shapes.
 * Exports: LegacyCompatibleModelProfileFileSchema, LegacyCompatibleModelProfileRegistrySchema,
 *          normalizeLoadedModelProfileRegistry
 *
 * Invariants:
 * - Old profile files may include runtime variants that are no longer executable.
 * - Unsupported runtime variants are dropped with a warning before current schema validation.
 */

import type { Logger } from "pino";
import { z } from "zod";
import { supportedRuntimeNames } from "../../schemas/common.schema.js";
import {
	ConfiguredModelProfileSchema,
	ConfiguredModelVariantValueSchema,
	ModelProfileFileSchema,
	type ModelProfileRegistry,
	ModelProfileRegistrySchema,
} from "../../schemas/model-profile.schema.js";

const SUPPORTED_RUNTIME_NAME_SET = new Set<string>(supportedRuntimeNames);

const LegacyCompatibleConfiguredModelProfileSchema =
	ConfiguredModelProfileSchema.extend({
		variants: z.record(
			z.string().trim().min(1),
			ConfiguredModelVariantValueSchema,
		),
	});

/** Schema accepting current profile fields with legacy runtime keys. */
export const LegacyCompatibleModelProfileRegistrySchema = z.record(
	z.string().trim().min(1),
	LegacyCompatibleConfiguredModelProfileSchema,
);

/** Schema accepting current and prior-current profile wrappers for compatibility. */
export const LegacyCompatibleModelProfileFileSchema = z.object({
	schemaVersion: z.union([
		ModelProfileFileSchema.shape.schemaVersion,
		z.literal("0.5.1"),
	]),
	models: LegacyCompatibleModelProfileRegistrySchema,
});

type RegistryLogger = Pick<Logger, "warn">;

/**
 * Filters unsupported runtime variants from a legacy-compatible loaded registry.
 *
 * @param registry - Legacy-compatible loaded registry
 * @param log - Loader logger for compatibility diagnostics
 * @returns Registry normalized to the current supported runtime set
 * @throws {Error} If the normalized payload still fails current schema validation
 */
export function normalizeLoadedModelProfileRegistry(
	registry: z.infer<typeof LegacyCompatibleModelProfileRegistrySchema>,
	log: RegistryLogger,
): ModelProfileRegistry {
	const droppedRuntimeNames = new Set<string>();
	const normalized = Object.fromEntries(
		Object.entries(registry).map(([profileKey, profile]) => [
			profileKey,
			{
				...profile,
				variants: Object.fromEntries(
					Object.entries(profile.variants).filter(([runtime]) => {
						const isSupported = SUPPORTED_RUNTIME_NAME_SET.has(runtime);
						if (!isSupported) {
							droppedRuntimeNames.add(runtime);
						}
						return isSupported;
					}),
				),
			},
		]),
	);

	if (droppedRuntimeNames.size > 0) {
		log.warn(
			{ droppedRuntimeNames: [...droppedRuntimeNames].sort() },
			"Ignoring unsupported runtime variants from loaded model profile file",
		);
	}

	return ModelProfileRegistrySchema.parse(normalized);
}
