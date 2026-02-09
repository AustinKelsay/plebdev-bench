/**
 * Purpose: Dashboard aggregations public API (stable import path).
 * Exports: re-exports from aggregations-core, aggregations-tooling, aggregations-compare
 *
 * Invariants:
 * - Keep this module small; split implementations by concern (<500 lines)
 * - UI code should import from `@/lib/aggregations` only
 */

export * from "./aggregations-core";
export * from "./aggregations-tooling";
export * from "./aggregations-compare";
