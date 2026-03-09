/**
 * Purpose: Shared primitives and constants for the benchmark domain.
 * Exports: SCHEMA_VERSION, passTypes, PassTypeSchema, PassType,
 *          itemStatusTypes, ItemStatusSchema, ItemStatus,
 *          runtimeNames, RuntimeNameSchema, RuntimeName,
 *          testCategories, TestCategorySchema, TestCategory,
 *          testScoringModes, TestScoringModeSchema, TestScoringMode,
 *          benchmark/machine/provenance metadata schemas
 */

import { z } from "zod";

/** Current schema version for all result/plan files. */
export const SCHEMA_VERSION = "0.3.0";

/** Valid runtime names (inference backends). */
export const runtimeNames = ["ollama", "vllm"] as const;

/** Zod schema for runtime names. */
export const RuntimeNameSchema = z.enum(runtimeNames);

/** Runtime name type. */
export type RuntimeName = z.infer<typeof RuntimeNameSchema>;

/** Valid pass types for benchmark runs. */
export const passTypes = ["blind", "informed"] as const;

/** Zod schema for pass types. */
export const PassTypeSchema = z.enum(passTypes);

/** Pass type: 'blind' (no hints) or 'informed' (with context). */
export type PassType = z.infer<typeof PassTypeSchema>;

/** Valid benchmark test categories. */
export const testCategories = ["coding", "computer-use"] as const;

/** Zod schema for benchmark test categories. */
export const TestCategorySchema = z.enum(testCategories);

/** Benchmark test category. */
export type TestCategory = z.infer<typeof TestCategorySchema>;

/** Valid scoring modes for benchmark tests. */
export const testScoringModes = ["code-module", "workspace"] as const;

/** Zod schema for benchmark test scoring modes. */
export const TestScoringModeSchema = z.enum(testScoringModes);

/** Benchmark test scoring mode. */
export type TestScoringMode = z.infer<typeof TestScoringModeSchema>;

/** Valid statuses for matrix items. */
export const itemStatusTypes = [
	"pending",
	"running",
	"completed",
	"failed",
] as const;

/** Zod schema for item status. */
export const ItemStatusSchema = z.enum(itemStatusTypes);

/** Status of a matrix item during/after execution. */
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

/** Valid generation failure types. */
export const generationFailureTypes = [
	"timeout",
	"api_error",
	"tool_missing",
	"harness_error",
	"prompt_not_found",
	"unknown",
] as const;

/** Zod schema for generation failure types. */
export const GenerationFailureTypeSchema = z.enum(generationFailureTypes);

/** Generation failure type. */
export type GenerationFailureType = z.infer<typeof GenerationFailureTypeSchema>;

/** Valid scoring failure types. */
export const scoringFailureTypes = [
	"extraction",
	"import",
	"missing_export",
	"factory_init_failed",
	"export_validation",
	"test_execution",
	"spec_load",
	"no_spec",
	"unknown",
] as const;

/** Zod schema for scoring failure types. */
export const ScoringFailureTypeSchema = z.enum(scoringFailureTypes);

/** Scoring failure type. */
export type ScoringFailureType = z.infer<typeof ScoringFailureTypeSchema>;

/** Valid frontier eval failure types. */
export const frontierEvalFailureTypes = [
	"timeout",
	"auth_error",
	"rate_limited",
	"http_error",
	"invalid_response",
	"parse_error",
	"truncated",
	"unknown",
] as const;

/** Zod schema for frontier eval failure types. */
export const FrontierEvalFailureTypeSchema = z.enum(frontierEvalFailureTypes);

/** Frontier eval failure type. */
export type FrontierEvalFailureType = z.infer<
	typeof FrontierEvalFailureTypeSchema
>;

/** Valid verification status values for externally shared runs. */
export const verificationStatusTypes = [
	"self_reported",
	"verified",
	"rejected",
] as const;

/** Zod schema for verification status values. */
export const VerificationStatusSchema = z.enum(verificationStatusTypes);

/** Verification status for run provenance. */
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** Zod schema for benchmark checkpoint identity metadata. */
export const BenchmarkCheckpointSchema = z.object({
	/** Stable checkpoint identifier (derived from manifest hash). */
	checkpointId: z.string().min(1),

	/** Checkpoint hashing algorithm descriptor. */
	algorithm: z.string().min(1),

	/** SHA-256 hash of the benchmark asset manifest. */
	manifestHash: z.string().min(1),

	/** Number of benchmark-defining assets in the manifest. */
	assetCount: z.number().int().nonnegative(),

	/** ISO 8601 timestamp when checkpoint was computed. */
	computedAt: z.string().datetime(),
});

/** Benchmark checkpoint identity metadata. */
export type BenchmarkCheckpoint = z.infer<typeof BenchmarkCheckpointSchema>;

/** Zod schema for runtime environment metadata. */
export const RuntimeEnvironmentSchema = z.object({
	/** Runtime platform name (e.g., darwin, linux). */
	platform: z.string().min(1),

	/** Bun version used by the runner. */
	bunVersion: z.string().min(1),
});

/** Runtime environment metadata. */
export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

/** Zod schema for sanitized machine hardware profile metadata. */
export const HardwareProfileSchema = z.object({
	/** Host platform name (e.g., darwin, linux). */
	platform: z.string().min(1),

	/** CPU architecture (e.g., arm64, x64). */
	arch: z.string().min(1),

	/** OS release value from runtime host. */
	osRelease: z.string().min(1),

	/** Primary CPU model string. */
	cpuModel: z.string().min(1),

	/** Number of logical CPU cores. */
	logicalCores: z.number().int().positive(),

	/** Total machine memory in bytes. */
	totalMemoryBytes: z.number().int().positive(),
});

/** Sanitized machine hardware profile metadata. */
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;

/** Zod schema for machine profile metadata. */
export const MachineProfileSchema = z.object({
	/** Stable machine profile identifier. */
	profileId: z.string().min(1),

	/** Optional human-readable machine label. */
	label: z.string().min(1).optional(),

	/** Sanitized hardware profile details. */
	hardware: HardwareProfileSchema,
});

/** Machine profile metadata used for aggregation and filtering. */
export type MachineProfile = z.infer<typeof MachineProfileSchema>;

/** Zod schema for run provenance metadata. */
export const RunProvenanceSchema = z.object({
	/** Verification status for this run submission. */
	verificationStatus: VerificationStatusSchema.default("self_reported"),

	/** Source that produced the run artifact. */
	source: z.string().min(1).default("local_cli"),

	/** Optional submitter identity string (future use). */
	submittedBy: z.string().min(1).optional(),

	/** Optional submit timestamp (future use). */
	submittedAt: z.string().datetime().optional(),

	/** Optional free-form provenance notes. */
	notes: z.string().min(1).optional(),
});

/** Run provenance metadata. */
export type RunProvenance = z.infer<typeof RunProvenanceSchema>;
