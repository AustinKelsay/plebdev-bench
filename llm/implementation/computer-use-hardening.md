Purpose: Document the current computer-use benchmark hardening rules, capability gating, and preflight behavior.

# Computer-Use Hardening

## Scope

This note covers the post-March 2026 behavior for computer-use benchmarks. It is the current reference for:

- capability-aware scheduling
- preflight test coverage
- Goose workspace turn budgets
- OpenCode workspace tool exposure
- fresh-workspace retries for transient harness failures
- per-test timeout multipliers for longer workspace tasks
- interpretation rules for harness-originated failures

## Capability-Aware Scheduling

Computer-use tests can declare `requiredHarnessCapabilities` and `timeoutMultiplier` in `src/tests/<slug>/test.meta.json`.

Current capabilities:
- `workspace-read`
- `workspace-write`
- `workspace-mkdir`
- `workspace-search`
- `workspace-delete`

The plan builder only schedules a test on a harness when that harness advertises every required capability. This prevents invalid rows such as delete benchmarks on read/write-only harnesses.

Directory creation is modeled explicitly. Read/write-only tests must keep any parent directories needed for created files in the seeded fixture. Tests that require creating new directory paths must declare `workspace-mkdir`.

Timeout policy is also test-aware now:
- simple workspace rows can keep the default multiplier (`1.0`)
- longer filesystem tasks can raise `timeoutMultiplier`
- the expanded `plan.json` records the resolved multiplier per row so timeout behavior is reproducible

## Preflight Coverage

Preflights are identified by the `preflight` tag and run before ordinary benchmark rows for the same runtime/model/harness slice.

Current preflight tests:
- `tool-smoke` for baseline code-output tool use
- `workspace-tool-smoke` for workspace read/write without implicit directory creation
- `file-search-smoke` for workspace search + directory creation
- `file-delete-smoke` for workspace delete + directory creation

Preflights use a single pass type, preferring `blind` when available, to keep validation overhead low. If a preflight fails with `tool_missing`, later tool-dependent rows in that slice are skipped and recorded as tool failures instead of being interpreted as model evidence.

## Harness Notes

Goose:
- code-output defaults remain `gooseMaxTurns=1` and `gooseRetryMaxTurns=3`
- workspace defaults are `gooseWorkspaceMaxTurns=8` and `gooseWorkspaceRetryMaxTurns=12`
- workspace prompts now include the concrete workspace root path to reduce accidental inspection outside the seeded fixture

OpenCode:
- workspace-mode prompts explicitly advertise `read`, `glob`, `grep`, and `bash`
- workspace config enables those tools so mkdir/search/delete tasks are benchmarking model behavior rather than missing affordances

Transient harness failures:
- generation retries once when the failure class is `harness_error`
- workspace retries reseed a fresh isolated workspace before the second attempt
- if the retry fails again, the row is still recorded as `harness_error`

## Result Interpretation

Use the following rules when reading computer-use runs:

- Compare only runs built from the same capability-qualified matrix.
- Treat preflight failures as harness-slice failures first.
- Treat `harness_error` as an infra or harness-reliability signal. The runner already retries it once automatically; repeated failures are the ones that matter.
- When reading summaries, separate:
  - semantic scored-check pass rate
  - item success rate across the whole matrix
  - scored-row coverage
- Do not compare pre-hardening computer-use runs against post-hardening runs as if they were equivalent.
