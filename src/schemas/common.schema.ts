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
