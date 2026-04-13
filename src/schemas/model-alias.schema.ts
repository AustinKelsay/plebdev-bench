/**
 * Purpose: Legacy model alias schema retained for migration into model profiles.
 * Exports: ModelAliasEntrySchema, ModelAliasEntry,
 *          ModelAliasMapSchema, ModelAliasMap,
 *          ModelAliasFileSchema, ModelAliasFile
 *
 * Model aliases allow specifying a canonical model name that maps to
 * runtime-specific identifiers. Historical artifacts may contain multiple runtime
 * mappings, but current live benchmark config only executes Ollama.
 *
 * Invariants:
 * - Alias keys are canonical names (stable across runs)
 * - Values map runtime name -> non-empty model identifier string
 * - Runtime keys are arbitrary strings for backwards compatibility
 *
 * Example:
 * {
 *   "qwen3-8b": {
 *     "ollama": "qwen3:8b"
 *   }
 * }
 */

import { z } from "zod";
import { SCHEMA_VERSION } from "./common.schema.js";

/**
 * Schema for a single model alias entry.
 * Maps runtime names to their specific model identifiers.
 */
export const ModelAliasEntrySchema = z.record(
	z.string(), // runtime name retained for backwards compatibility
	z.string(), // runtime-specific model name
);

/**
 * Schema for the complete model alias map.
 * Keys are canonical alias names, values are runtime mappings.
 */
export const ModelAliasMapSchema = z.record(
	z.string(), // alias name (e.g., "qwen3-8b")
	ModelAliasEntrySchema,
);

/** Type for a single alias entry (runtime -> model name). */
export type ModelAliasEntry = z.infer<typeof ModelAliasEntrySchema>;

/** Type for the complete model alias map. */
export type ModelAliasMap = z.infer<typeof ModelAliasMapSchema>;

/** Versioned wrapper for persisted alias files. */
export const ModelAliasFileSchema = z.object({
	schemaVersion: z.string().default(SCHEMA_VERSION),
	aliases: ModelAliasMapSchema,
});

/** Persisted alias file type. */
export type ModelAliasFile = z.infer<typeof ModelAliasFileSchema>;
