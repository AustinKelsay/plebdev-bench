Purpose: Post-MVP phase focused on a results dashboard and harness performance optimizations for `plebdev-bench`.

# Scale & Polish Phase

**Status: COMPLETE**

This phase builds on the MVP to add a visual dashboard for exploring results and optimize harness performance for faster runs.

## Goals
- Provide a beautiful, terminal-inspired dashboard for browsing and comparing benchmark results.
- Reduce run times through harness interface optimizations and smarter timeout calculations.
- Maintain the core contract: CLI-first, stable schemas, deterministic compare.

## Inputs
- `llm/project/project-overview.md`
- `llm/project/user-flow.md`
- `llm/project/tech-stack.md`
- `llm/project/design-rules.md`
- `llm/project/project-rules.md`

## Scope
- In scope: dashboard frontend, harness optimizations, timeout tuning.
- Out of scope: caching, parallelism, schema migrations, distributed runs.

## Steps (per feature)

### Feature A — Dashboard Frontend ✓

**Stack:** Vite + React + TypeScript + shadcn/ui + Recharts

**Delivered:**
1. ✓ Vite React TypeScript project in `apps/dashboard/`
2. ✓ shadcn/ui with dark theme, terminal-inspired palette
3. ✓ Data layer reading `results/<run-id>/run.json` and `plan.json`
4. ✓ Core views:
   - **Run List:** Browse runs with summary cards
   - **Run Detail:** Matrix table, status badges, timing stats, scoring breakdowns
   - **Compare View:** Side-by-side diff with deltas
5. ✓ Recharts visualizations (5 charts):
   - **CompositeScoreChart**: Effective score + pass rate + tool success + frontier
   - **BlindVsInformedChart**: Paired bars comparing pass types
   - **PassRateChart**: Pass rate by dimension
   - **TimingDistribution**: Histogram with p50/p90 markers
   - **FrontierEvalScatter**: Pass rate vs frontier score
6. ✓ Static file loading (no live updates)
7. ✓ Responsive layout

**Additional Components Delivered:**
- 9 run-detail components (including failure/tooling breakdowns, dimension dialogs)
- InfoTooltip for chart explanations
- Aggregation functions for composite metrics, blind/informed, tool success

### Feature B — Harness Performance Optimizations ✓

**Goal:** Reduce typical run time by 10-20%, clean up interfaces, and enable lower default timeouts.

#### B.1 — Goose Adapter Cleanup ✓

- ✓ Removed undocumented environment variables (GOOSE_MODE, GOOSE_CONTEXT_STRATEGY, GOOSE_MAX_TURNS)
- ✓ Kept documented env vars (GOOSE_PROVIDER, GOOSE_MODEL, GOOSE_CLI_MIN_PRIORITY)
- ✓ Added `--output-format json`
- ✓ Use stdin for prompts (`-i -`)

#### B.2 — OpenCode Adapter Cleanup ✓

- ✓ Switched from server mode to direct mode (more reliable tool execution)
- ✓ Added `--format json` for structured output
- ✓ Added `--agent build` for tool access
- ✓ Local `opencode.json` config per work directory

#### B.3 — OpenCode Server Optimization ✓

- ✓ Implemented exponential backoff for health checks (100ms → 1.5x → 500ms cap)
- Note: Server mode deprecated in favor of direct mode

#### B.4 — Timeout Tuning ✓

- ✓ Dynamic OpenCode overhead: `60s + (params/10 * 30s)`
- ✓ Lower minimum timeout: 120s → 60s
- Skipped `--fast` flag (user decision to keep CLI simpler)

#### B.5 — Runner Optimizations ✓

- ✓ Parallelized model discovery with `Promise.all()`
- ✓ Cached model parameter values per unique model

### Feature C — Tool-Smoke Test ✓

**Added during implementation:**
- ✓ `src/tests/tool-smoke/` preflight test for tool-calling harnesses
- ✓ `src/harnesses/tool-prompt.ts` for consistent tool prompt building
- ✓ Tool success tracking in dashboard (CompositeScoreChart, ToolingBreakdown)
- ✓ `tool_missing` failure type for tool-calling failures

## Exit Criteria

All criteria met:

- ✓ Dashboard renders run list, detail, and compare views with shadcn styling
- ✓ Charts display pass rates, timing, and scores using Recharts (5 charts implemented)
- ✓ Harness optimizations reduce multi-harness run time by 10-20%
- ✓ Lower default timeouts (60s min, scaled OpenCode overhead) work reliably
- ✓ No regressions in run stability or result accuracy
- ✓ Tool-smoke test verifies tool-calling support before main tests
- ✓ Composite score formula weights completion and tool success
