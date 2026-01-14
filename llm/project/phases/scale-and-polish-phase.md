Purpose: Post-MVP phase focused on enhancements, scale, and polish for `plebdev-bench` while keeping the tool deterministic and terminal-native.

# Scale & Polish Phase

This phase builds on the MVP to improve usability, throughput, and long-run maintainability without changing the core contract (non-interactive by default, stable schemas, deterministic compare).

## Goals
- Make repeated benchmarking faster and more reliable on a single machine.
- Improve analysis ergonomics (compare, filtering, exports) while keeping terminal-native UX.
- Reduce operational friction (config ergonomics, caching, better diagnostics).

## Inputs
- `llm/project/project-overview.md`
- `llm/project/user-flow.md`
- `llm/project/tech-stack.md`
- `llm/project/design-rules.md`
- `llm/project/project-rules.md`

## Scope
- In scope: caching, parallelism (bounded), better compare UX, exports, improved error diagnostics, schema migrations.
- Out of scope: distributed runs, hosted UI, database-first storage (unless explicitly revisited).

## Steps (per feature)

### Feature A — Performance + throughput (bounded parallelism)
1. Add bounded concurrency for matrix execution (configurable max concurrency).
2. Add time budgets and per-item timeouts by operation (generate/test/eval).
3. Add a resource-usage sampling strategy that is best-effort and never blocks runs.

### Feature B — Caching + incremental reruns
1. Add optional caching keyed by (model, harness, test, passType, prompt hash, config hash).
2. Support rerunning only failed items and/or only changed items (deterministic selection rules).
3. Record cache hits/misses in `run.json` for transparency.

### Feature C — Compare UX + exports
1. Improve `bench compare` with:
   - grouping and filtering (by model/harness/test/passType)
   - “top regressions” and “top improvements” sections
2. Add export formats (CSV/JSON) for downstream analysis, keeping schemas stable.
3. Add snapshot tests to keep compare output deterministic across refactors.

### Feature D — Schema evolution + migrations
1. Add explicit migration tooling for `run.json` schema version changes.
2. Add fixtures for old schema versions and tests that validate migration correctness.
3. Document migration policy and backwards compatibility guarantees.

## Exit Criteria
- Benchmark execution supports bounded parallelism without compromising determinism.
- Users can rerun failed items and export results for analysis.
- Compare UX is richer but remains table/diff oriented and stable.
- Result schema changes are versioned and migrations are tested and documented.

