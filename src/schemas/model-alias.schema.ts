/**
 * Purpose: Model alias schema for cross-runtime model mapping.
 * Exports: ModelAliasEntrySchema, ModelAliasEntry,
 *          ModelAliasMapSchema, ModelAliasMap,
 *          ModelAliasFileSchema, ModelAliasFile
 *
 * Model aliases allow specifying a canonical model name that maps to
 * runtime-specific identifiers. This enables testing the "same" model
 * across different runtimes (Ollama, vLLM, etc.) where naming differs.
 *
 * Invariants:
 * - Alias keys are canonical names (stable across runs)
 * - Values map runtime name -> non-empty model identifier string
 * - Runtime keys are arbitrary strings, but should align with RuntimeNameSchema
 *
 * Example:
 * {
 *   "qwen3-8b": {
 *     "ollama": "qwen3:8b",
 *     "vllm": "Qwen/Qwen3-8B-Instruct"
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
	z.string(), // runtime name (ollama, vllm, etc.)
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
