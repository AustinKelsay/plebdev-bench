/**
 * Purpose: Runtime name schemas and compatibility migration helpers.
 * Exports: runtime name literals, Zod schemas, inferred types, legacy migration helper
 *
 * Invariants:
 * - `supportedRuntimeNames` is the active execution runtime set.
 * - `artifactRuntimeNames` extends active runtimes for historical artifacts.
 */

import { z } from "zod";

/** Valid runtime names for active benchmark execution. */
export const supportedRuntimeNames = ["ollama"] as const;

/** Zod schema for runtimes accepted by current config and execution flows. */
export const SupportedRuntimeNameSchema = z.enum(supportedRuntimeNames);

/** Runtime name type accepted by current config and execution flows. */
export type SupportedRuntimeName = z.infer<typeof SupportedRuntimeNameSchema>;

/** Legacy runtime mappings for config migration into the active runtime set. */
const LEGACY_SUPPORTED_RUNTIME_MIGRATIONS = {
	vllm: "ollama",
} as const satisfies Record<string, SupportedRuntimeName>;

/**
 * Migrates legacy config runtime names into currently supported runtimes.
 *
 * @param runtimeNames - Raw runtime list from config input
 * @returns Runtime list with known legacy names mapped to active runtimes
 * @throws {never} Unknown values are preserved for schema validation errors
 */
export function migrateLegacySupportedRuntimeNames(
	runtimeNames: unknown,
): unknown {
	if (!Array.isArray(runtimeNames)) {
		return runtimeNames;
	}
	const migrated = runtimeNames.map((runtimeName) =>
		typeof runtimeName === "string" &&
		runtimeName in LEGACY_SUPPORTED_RUNTIME_MIGRATIONS
			? LEGACY_SUPPORTED_RUNTIME_MIGRATIONS[
					runtimeName as keyof typeof LEGACY_SUPPORTED_RUNTIME_MIGRATIONS
				]
			: runtimeName,
	);
	return Array.from(new Set(migrated));
}

/** Valid runtime names allowed when reading historical plan/result artifacts. */
export const artifactRuntimeNames = ["ollama", "vllm"] as const;

/** Zod schema for runtimes allowed in stored artifacts. */
export const ArtifactRuntimeNameSchema = z.enum(artifactRuntimeNames);

/** Runtime name type allowed in stored artifacts. */
export type ArtifactRuntimeName = z.infer<typeof ArtifactRuntimeNameSchema>;

/** Zod schema for persisted runtimes that remain executable by this version. */
export const ExecutableArtifactRuntimeNameSchema = SupportedRuntimeNameSchema;

/** Runtime name type for persisted rows this version can execute/replay. */
export type ExecutableArtifactRuntimeName = z.infer<
	typeof ExecutableArtifactRuntimeNameSchema
>;
