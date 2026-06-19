/**
 * Purpose: BenchConfig schema for CLI input and config file parsing.
 * Exports: BenchConfigSchema, BenchConfig, defaultConfig, migrateBenchConfigAliases
 *
 * Invariants:
 * - Runtime selection is Ollama-only for active benchmark execution
 * - Empty arrays mean "select all available" for models/tests/harnesses/categories
 * - Use flags to limit which models/tests/harnesses/categories to run
 */

import { z } from "zod";
import {
	PassTypeSchema,
	SCHEMA_VERSION,
	SupportedRuntimeNameSchema,
	TestCategorySchema,
	migrateLegacySupportedRuntimeNames,
} from "./common.schema.js";
import { ModelAliasMapSchema } from "./model-alias.schema.js";
import { ModelProfileRegistrySchema } from "./model-profile.schema.js";

/**
 * Trims a candidate string and returns undefined when absent.
 *
 * @param value - Candidate config field
 * @returns Trimmed non-empty string or undefined
 */
function readNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Converts the deprecated alias-only model map into the canonical model-profile registry.
 *
 * @param value - Raw legacy alias map candidate
 * @returns Model-profile registry preserving runtime mappings under `variants`, or undefined when malformed
 */
function migrateLegacyModelAliases(value: unknown): unknown {
	const parsed = ModelAliasMapSchema.safeParse(value);
	if (!parsed.success) {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(parsed.data).map(([profileKey, runtimeMap]) => [
			profileKey,
			{
				profileLabel: profileKey,
				family: profileKey,
				variants: runtimeMap,
			},
		]),
	);
}

/**
 * Normalizes deprecated machine config aliases into the canonical machine fields.
 *
 * @param raw - Arbitrary config-like input
 * @returns Normalized config input preserving unknown fields for the next parse step
 */
export function migrateBenchConfigAliases(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return raw;
	}

	const config = { ...(raw as Record<string, unknown>) };
	if (
		config.schemaVersion !== undefined &&
		config.schemaVersion !== SCHEMA_VERSION &&
		Array.isArray(config.runtimes)
	) {
		config.runtimes =
			config.runtimes.length === 0
				? ["ollama"]
				: migrateLegacySupportedRuntimeNames(config.runtimes);
	}
	const machineProfileId = readNonEmptyString(config.machineProfileId);
	const machineLabel = readNonEmptyString(config.machineLabel);

	if (
		config.machineInstanceId === undefined &&
		machineProfileId !== undefined
	) {
		config.machineInstanceId = machineProfileId;
	}
	if (config.machineDisplayLabel === undefined && machineLabel !== undefined) {
		config.machineDisplayLabel = machineLabel;
	}

	if (
		config.modelProfiles === undefined &&
		Object.prototype.hasOwnProperty.call(config, "modelAliases")
	) {
		const migratedModelAliases = migrateLegacyModelAliases(config.modelAliases);
		if (migratedModelAliases !== undefined) {
			config.modelProfiles = migratedModelAliases;
			config.modelAliases = undefined;
		}
	}

	return config;
}

const BenchConfigObjectSchema = z
	.object({
		/** Schema version for config evolution. */
		schemaVersion: z.string().default(SCHEMA_VERSION),

		/** Runtimes to use. Ollama is the only supported runtime. */
		runtimes: z
			.array(SupportedRuntimeNameSchema)
			.nonempty("runtimes must include at least one runtime")
			.default(["ollama"]),

		/** Models to benchmark. Empty array triggers auto-discovery from runtime. */
		models: z.array(z.string()).default([]),

		/** Harness adapters to use. Empty array triggers auto-discovery of all available. */
		harnesses: z.array(z.string()).default([]),

		/** Test slugs to run. Empty array runs all tests in src/tests/. */
		tests: z.array(z.string()).default([]),

		/** Test categories to run. Empty array runs all categories. */
		categories: z.array(TestCategorySchema).default([]),

		/** Pass types to run for each model/test combination. */
		passTypes: z.array(PassTypeSchema).default(["blind", "informed"]),

		/** Ollama API base URL. */
		ollamaBaseUrl: z.string().url().default("http://localhost:11434"),

		/** Removed runtime configuration retained only to emit a targeted validation error. */
		vllmBaseUrl: z.preprocess(
			(value) => (typeof value === "string" ? value.trim() : value),
			z.unknown().optional(),
		),

		/** Generation timeout in milliseconds (5 min default for large models). */
		generateTimeoutMs: z.number().positive().default(300_000),

		/** Goose first-attempt max turns in headless mode. */
		gooseMaxTurns: z.number().int().positive().default(1),

		/** Goose retry-attempt max turns in headless mode. */
		gooseRetryMaxTurns: z.number().int().positive().default(3),

		/** Goose first-attempt max turns for workspace-scored benchmarks. */
		gooseWorkspaceMaxTurns: z.number().int().positive().default(8),

		/** Goose retry-attempt max turns for workspace-scored benchmarks. */
		gooseWorkspaceRetryMaxTurns: z.number().int().positive().default(12),

		/** Hermes first-attempt max turns in headless mode. */
		hermesMaxTurns: z.number().int().positive().default(1),

		/** Hermes retry-attempt max turns in headless mode. */
		hermesRetryMaxTurns: z.number().int().positive().default(3),

		/** Hermes first-attempt max turns for workspace-scored benchmarks. */
		hermesWorkspaceMaxTurns: z.number().int().positive().default(8),

		/** Hermes retry-attempt max turns for workspace-scored benchmarks. */
		hermesWorkspaceRetryMaxTurns: z.number().int().positive().default(12),

		/** Output directory for results. */
		outputDir: z.string().default("results"),

		/** Optional explicit machine instance identifier. */
		machineInstanceId: z.string().trim().min(1).optional(),

		/** Optional human-readable display label for a specific machine instance. */
		machineDisplayLabel: z.string().trim().min(1).optional(),

		/** Deprecated alias for machine instance identity. */
		machineProfileId: z.string().trim().min(1).optional(),

		/** Deprecated alias for machine display label. */
		machineLabel: z.string().trim().min(1).optional(),

		/** Canonical model profiles with runtime-specific variant mappings. */
		modelProfiles: ModelProfileRegistrySchema.default({}),

		/** Deprecated alias-only model mapping format retained for migration. */
		modelAliases: ModelAliasMapSchema.optional(),
	})
	.superRefine((config, context) => {
		if (
			config.machineInstanceId !== undefined &&
			config.machineProfileId !== undefined &&
			config.machineInstanceId !== config.machineProfileId
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["machineProfileId"],
				message: `Conflicting bench config machine IDs: machineInstanceId="${config.machineInstanceId}" does not match deprecated machineProfileId="${config.machineProfileId}"`,
			});
		}

		if (
			config.machineDisplayLabel !== undefined &&
			config.machineLabel !== undefined &&
			config.machineDisplayLabel !== config.machineLabel
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["machineLabel"],
				message: `Conflicting bench config machine labels: machineDisplayLabel="${config.machineDisplayLabel}" does not match deprecated machineLabel="${config.machineLabel}"`,
			});
		}

		if (config.modelProfiles && config.modelAliases) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["modelAliases"],
				message:
					'Bench config must not specify both "modelProfiles" and deprecated "modelAliases"',
			});
		}

		if (config.vllmBaseUrl !== undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["vllmBaseUrl"],
				message:
					'Bench config no longer supports "vllmBaseUrl". Remove it and run with Ollama only.',
			});
		}

		if (config.gooseRetryMaxTurns < config.gooseMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["gooseRetryMaxTurns"],
				message:
					"gooseRetryMaxTurns must be greater than or equal to gooseMaxTurns",
			});
		}

		if (config.gooseWorkspaceRetryMaxTurns < config.gooseWorkspaceMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["gooseWorkspaceRetryMaxTurns"],
				message:
					"gooseWorkspaceRetryMaxTurns must be greater than or equal to gooseWorkspaceMaxTurns",
			});
		}

		if (config.hermesRetryMaxTurns < config.hermesMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["hermesRetryMaxTurns"],
				message:
					"hermesRetryMaxTurns must be greater than or equal to hermesMaxTurns",
			});
		}

		if (config.hermesWorkspaceRetryMaxTurns < config.hermesWorkspaceMaxTurns) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["hermesWorkspaceRetryMaxTurns"],
				message:
					"hermesWorkspaceRetryMaxTurns must be greater than or equal to hermesWorkspaceMaxTurns",
			});
		}
	});

const BenchConfigOutputSchema = BenchConfigObjectSchema.transform(
	({
		machineProfileId: _machineProfileId,
		machineLabel: _machineLabel,
		modelAliases: _modelAliases,
		vllmBaseUrl: _vllmBaseUrl,
		...config
	}) => config,
);

/** Zod schema for benchmark configuration. */
export const BenchConfigSchema = z.preprocess(
	migrateBenchConfigAliases,
	BenchConfigOutputSchema,
);

/** Benchmark configuration type. */
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

/** Default configuration with all defaults applied. */
export const defaultConfig: BenchConfig = BenchConfigSchema.parse({});
