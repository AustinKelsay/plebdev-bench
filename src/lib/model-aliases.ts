/**
 * Purpose: Legacy model alias resolution helpers retained for migration.
 * Exports: loadModelAliases, resolveModelForRuntime, parseInlineAlias, isAlias
 *
 * Resolves canonical model names to runtime-specific identifiers.
 * New live config should prefer model profiles and active execution only uses Ollama,
 * but legacy alias files are still accepted for migration.
 * Supports loading from JSON file or parsing inline CLI definitions.
 *
 * Invariants:
 * - Unknown aliases pass through unchanged (allows mixing aliases with raw names)
 * - Missing runtime mapping returns undefined (caller decides how to handle)
 */

import * as fs from "node:fs";
import {
	ModelAliasFileSchema,
	type ModelAliasMap,
	ModelAliasMapSchema,
} from "../schemas/model-alias.schema.js";
import { logger } from "./logger.js";

/**
 * Loads model aliases from a JSON file.
 *
 * @param filePath - Path to the JSON config file
 * @returns Parsed and validated alias map
 * @throws {Error} If file doesn't exist or is invalid
 */
export function loadModelAliases(filePath: string): ModelAliasMap {
	const log = logger.child({ module: "model-aliases" });

	if (!fs.existsSync(filePath)) {
		throw new Error(`Model alias file not found: ${filePath}`);
	}

	const raw = fs.readFileSync(filePath, "utf-8");
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(`Invalid JSON in model alias file: ${filePath}`);
	}

	// Prefer the versioned wrapper when present; fall back to raw map format.
	const wrapper = ModelAliasFileSchema.safeParse(parsed);
	if (wrapper.success) {
		log.debug(
			{
				aliasCount: Object.keys(wrapper.data.aliases).length,
				schemaVersion: wrapper.data.schemaVersion,
			},
			"Loaded versioned model alias file",
		);
		return wrapper.data.aliases;
	}

	const result = ModelAliasMapSchema.safeParse(parsed);
	if (!result.success) {
		throw new Error(
			`Invalid model alias format in ${filePath}: ${result.error.message}`,
		);
	}

	log.debug(
		{ aliasCount: Object.keys(result.data).length },
		"Loaded model aliases",
	);
	return result.data;
}

/**
 * Parses an inline alias definition from CLI.
 *
 * Format: "alias-name=runtime1:model1,runtime2:model2"
 * Example: "qwen3-8b=ollama:qwen3:8b"
 *
 * @param inline - Inline alias definition string
 * @returns Parsed alias map with single entry
 * @throws {Error} If format is invalid
 */
export function parseInlineAlias(inline: string): ModelAliasMap {
	const eqIndex = inline.indexOf("=");
	if (eqIndex === -1) {
		throw new Error(
			`Invalid inline alias format: "${inline}". Expected: "alias=runtime:model,runtime:model"`,
		);
	}

	const aliasName = inline.slice(0, eqIndex).trim();
	const mappings = inline.slice(eqIndex + 1).trim();

	if (!aliasName || !mappings) {
		throw new Error(
			`Invalid inline alias format: "${inline}". Both alias name and mappings required.`,
		);
	}

	const entry: Record<string, string> = {};

	// Split by comma, but handle model names that might contain colons
	// Format: runtime:model where model can contain colons (e.g., "ollama:qwen3:8b")
	const parts = mappings.split(",");

	for (const part of parts) {
		const colonIndex = part.indexOf(":");
		if (colonIndex === -1) {
			throw new Error(
				`Invalid mapping in alias "${aliasName}": "${part}". Expected "runtime:model".`,
			);
		}

		const runtime = part.slice(0, colonIndex).trim();
		const model = part.slice(colonIndex + 1).trim();

		if (!runtime || !model) {
			throw new Error(
				`Invalid mapping in alias "${aliasName}": "${part}". Runtime and model required.`,
			);
		}

		entry[runtime] = model;
	}

	const parsed = ModelAliasMapSchema.safeParse({ [aliasName]: entry });
	if (!parsed.success) {
		throw new Error(
			`Invalid inline alias format: "${inline}". ${parsed.error.message}`,
		);
	}
	return parsed.data;
}

/**
 * Parses multiple inline alias definitions.
 *
 * @param inlines - Array of inline alias strings
 * @returns Combined alias map
 */
export function parseInlineAliases(inlines: string[]): ModelAliasMap {
	const combined: ModelAliasMap = {};

	for (const inline of inlines) {
		const parsed = parseInlineAlias(inline);
		Object.assign(combined, parsed);
	}

	return combined;
}

/**
 * Checks if a model name is a known alias.
 *
 * @param modelName - Model name to check
 * @param aliases - Alias map to check against
 * @returns true if the name is a defined alias
 */
export function isAlias(modelName: string, aliases: ModelAliasMap): boolean {
	return modelName in aliases;
}

/**
 * Resolves a model name to its runtime-specific identifier.
 *
 * @param modelName - Canonical model name or alias
 * @param runtime - Target runtime name
 * @param aliases - Alias map for resolution
 * @returns Runtime-specific model name, or undefined if alias has no mapping for runtime
 *
 * If modelName is not an alias, returns it unchanged (pass-through).
 */
export function resolveModelForRuntime(
	modelName: string,
	runtime: string,
	aliases: ModelAliasMap,
): string | undefined {
	// Not an alias - pass through unchanged
	if (!(modelName in aliases)) {
		return modelName;
	}

	// Alias found - look up runtime-specific name
	const entry = aliases[modelName];
	return entry[runtime]; // undefined if no mapping for this runtime
}

/**
 * Resolves a list of models for a specific runtime.
 * Expands aliases to runtime-specific names, passes through raw names.
 *
 * @param models - List of model names (may include aliases)
 * @param runtime - Target runtime
 * @param aliases - Alias map
 * @returns List of runtime-specific model names (excludes aliases without mapping)
 */
export function resolveModelsForRuntime(
	models: string[],
	runtime: string,
	aliases: ModelAliasMap,
): string[] {
	const resolved: string[] = [];

	for (const model of models) {
		const runtimeModel = resolveModelForRuntime(model, runtime, aliases);
		if (runtimeModel !== undefined) {
			resolved.push(runtimeModel);
		}
	}

	return resolved;
}

/**
 * Merges multiple alias maps, with later maps overriding earlier ones.
 *
 * @param maps - Alias maps to merge
 * @returns Combined alias map
 */
export function mergeAliases(...maps: ModelAliasMap[]): ModelAliasMap {
	const merged: ModelAliasMap = {};

	for (const map of maps) {
		for (const [alias, entry] of Object.entries(map)) {
			// Deep merge entries for the same alias
			if (alias in merged) {
				merged[alias] = { ...merged[alias], ...entry };
			} else {
				merged[alias] = { ...entry };
			}
		}
	}

	return merged;
}
