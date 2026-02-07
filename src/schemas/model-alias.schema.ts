/**
 * Purpose: Model alias schema for cross-runtime model mapping.
 * Exports: ModelAliasMapSchema, ModelAliasMap
 *
 * Model aliases allow specifying a canonical model name that maps to
 * runtime-specific identifiers. This enables testing the "same" model
 * across different runtimes (Ollama, vLLM, etc.) where naming differs.
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
