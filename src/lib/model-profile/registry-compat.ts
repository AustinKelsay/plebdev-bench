/**
 * Purpose: Compatibility loaders for legacy model-profile registry shapes.
 * Exports: LegacyCompatibleModelProfileFileSchema, LegacyCompatibleModelProfileRegistrySchema,
 *          normalizeLoadedModelProfileRegistry
 *
 * Invariants:
 * - Old profile files may include runtime variants that are no longer executable.
 * - Profiles with no supported runtime variants fail fast instead of being dropped.
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
export const LegacyCompatibleModelProfileFileSchema = z.strictObject({
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
 * or if migration filtering leaves any profile with no supported runtime variants
 */
export function normalizeLoadedModelProfileRegistry(
	registry: z.infer<typeof LegacyCompatibleModelProfileRegistrySchema>,
	log: RegistryLogger,
): ModelProfileRegistry {
	const droppedRuntimeNames = new Set<string>();
	const droppedProfiles: Array<{
		profileKey: string;
		originalRuntimes: string[];
	}> = [];
	const normalizedEntries: Array<
		[string, z.infer<typeof LegacyCompatibleConfiguredModelProfileSchema>]
	> = [];

	for (const [profileKey, profile] of Object.entries(registry)) {
		const originalRuntimes = Object.keys(profile.variants);
		const variants = Object.fromEntries(
			Object.entries(profile.variants).filter(([runtime]) => {
				const isSupported = SUPPORTED_RUNTIME_NAME_SET.has(runtime);
				if (!isSupported) {
					droppedRuntimeNames.add(runtime);
				}
				return isSupported;
			}),
		);

		if (Object.keys(variants).length === 0) {
			droppedProfiles.push({
				profileKey,
				originalRuntimes: originalRuntimes.sort(),
			});
			continue;
		}

		normalizedEntries.push([
			profileKey,
			{
				...profile,
				variants,
			},
		]);
	}

	const normalized = Object.fromEntries(normalizedEntries);

	if (droppedRuntimeNames.size > 0) {
		log.warn(
			{ droppedRuntimeNames: [...droppedRuntimeNames].sort() },
			"Ignoring unsupported runtime variants from loaded model profile file",
		);
	}
	if (droppedProfiles.length > 0) {
		throw new Error(
			`Model profile file contains profiles with no supported runtime variants: ${droppedProfiles
				.map(
					(profile) =>
						`${profile.profileKey} (original runtimes: ${profile.originalRuntimes.join(", ") || "none"})`,
				)
				.join(
					"; ",
				)}. Migrate these profiles to supported runtime variants before loading the registry.`,
		);
	}

	return ModelProfileRegistrySchema.parse(normalized);
}
