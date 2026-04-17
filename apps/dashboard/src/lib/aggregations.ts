/**
 * Purpose: Dashboard aggregations public API (stable import path).
 * Exports: re-exports from aggregations-core, aggregations-tooling, aggregations-compare, aggregations-diagnostics
 *
 * Invariants:
 * - Keep this module small; split implementations by concern (<500 lines)
 * - UI code should import from `@/lib/aggregations` only
 */

export * from "./aggregations-core.js";
export * from "./aggregations-tooling.js";
export * from "./aggregations-compare.js";
export * from "./aggregations-diagnostics.js";
export * from "./aggregations-charts.js";
export * from "./aggregations-test-types.js";
