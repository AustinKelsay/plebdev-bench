Purpose: Capture the March 9, 2026 leaderboard expansion checkpoint, including current state, verification, and handoff notes.

# Dashboard Leaderboard Checkpoint (March 9, 2026)

## Summary

This checkpoint expands the dashboard leaderboard from a narrow aggregate view into a richer model-vetting surface. The work stayed local in the primary checkout and was not merged into the clean comparison worktree created for manual smoke testing.

## What Changed

- Reworked the leaderboard page into a story-first layout with:
  - a benchmark hero
  - a workflow explainer for how the bench works
  - denser filter controls
  - richer KPI cards
- Added new leaderboard comparison views:
  - speed vs quality bubble chart
  - prompt-lift chart
  - model-by-test heatmap
  - reliability mix chart
  - model vetting board
- Enhanced the raw leaderboard results table with frontier score and failure-type visibility.
- Refined the global dashboard shell and header styling so the leaderboard feels more intentional and visually distinct.
- Added leaderboard-specific aggregation helpers and a focused unit test covering model ranking, prompt lift, and heatmap ordering.
- Fixed dashboard library import extensions so repo-wide TypeScript typecheck passes under NodeNext-style module resolution.

## Files Added

- `apps/dashboard/src/components/charts/benchmark-heatmap.tsx`
- `apps/dashboard/src/components/charts/model-efficiency-chart.tsx`
- `apps/dashboard/src/components/charts/prompt-lift-chart.tsx`
- `apps/dashboard/src/components/charts/status-composition-chart.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-hero.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-model-vetting-table.tsx`
- `apps/dashboard/src/components/ui/input.tsx`
- `apps/dashboard/src/lib/aggregations-leaderboard.ts`
- `test/dashboard-leaderboard-aggregations.test.ts`

## Files Updated

- `apps/dashboard/src/App.tsx`
- `apps/dashboard/src/components/layout/header.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-chart-gallery.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-filters.ts`
- `apps/dashboard/src/components/leaderboard/leaderboard-page.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-results-table.tsx`
- `apps/dashboard/src/components/leaderboard/leaderboard-summary-cards.tsx`
- `apps/dashboard/src/index.css`
- `apps/dashboard/src/lib/aggregations-core.ts`
- `apps/dashboard/src/lib/aggregations-tooling.ts`
- `apps/dashboard/src/lib/aggregations.ts`

## Current Behavior

### Leaderboard

- Filters now support:
  - search
  - machine
  - model multi-select
  - runtime
  - harness
  - pass type
  - test
  - status
  - category
  - provenance verification state
- All leaderboard summary cards, charts, and tables are driven from the filtered aggregate slice.
- The top of the page now explains benchmark mechanics directly instead of forcing readers to jump to the About page first.

### Visual Analysis

- Composite score remains the lead chart.
- New charts expose:
  - pass-rate vs latency tradeoffs
  - blind vs informed prompt sensitivity
  - model coverage by benchmark
  - completion/failure composition by model, harness, or test
- A model-level vetting table ranks models within the active filter scope by evidence-backed performance rather than a single opaque number.

### Raw Evidence

- The leaderboard item table now includes frontier score and surfaced failure-type fields so users can inspect why a row underperformed or failed.

## Verification Run During This Session

- `bun run dashboard:build`
  - passed
- `bun run typecheck`
  - passed
- `bun run test dashboard-leaderboard-aggregations.test.ts`
  - passed

## Known Risk / Follow-Up

- Vite still reports a large production chunk for the dashboard bundle. The build succeeds, but code-splitting charts would be a reasonable follow-up if load size becomes a concern.

## Local State At Checkpoint

- Primary modified checkout:
  - `/Users/plebdev/Desktop/code/plebdev-bench`
- Clean detached comparison worktree created from `HEAD` without these local changes:
  - `/tmp/plebdev-bench-clean-head`
- The user requested that the local server in the primary checkout remain running and untouched.

## Handoff Notes

- Use the clean worktree for baseline smoke tests and comparisons.
- Use the primary checkout for the richer leaderboard implementation and follow-up refinement.
- If the next smoke test reveals chart overload or performance issues, the first trimming candidates are lazy-loading secondary charts and simplifying the hero section before cutting core filters or the vetting table.
