/**
 * Purpose: Shared primitives and constants for the benchmark domain.
 * Exports: SCHEMA_VERSION, passTypes, PassTypeSchema, PassType,
 *          itemStatusTypes, ItemStatusSchema, ItemStatus
 */

import { z } from "zod";

/** Current schema version for all result/plan files. */
export const SCHEMA_VERSION = "0.1.0";

/** Valid pass types for benchmark runs. */
export const passTypes = ["blind", "informed"] as const;

/** Zod schema for pass types. */
export const PassTypeSchema = z.enum(passTypes);

/** Pass type: 'blind' (no hints) or 'informed' (with context). */
export type PassType = z.infer<typeof PassTypeSchema>;

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
export type FrontierEvalFailureType = z.infer<typeof FrontierEvalFailureTypeSchema>;
