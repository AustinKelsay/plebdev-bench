Purpose: Post-MVP phase focused on a results dashboard and harness performance optimizations for `plebdev-bench`.

# Scale & Polish Phase

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

### Feature A — Dashboard Frontend

**Stack:** Vite + React + TypeScript + shadcn/ui + Recharts

1. Initialize Vite React TypeScript project in `apps/dashboard/`.
2. Install and configure shadcn/ui (dark theme, terminal-inspired palette from design-rules.md).
3. Build data layer to read `results/<run-id>/run.json` and `plan.json` files.
4. Implement core views:
   - **Run List:** Browse all runs with summary cards (total items, pass rate, duration).
   - **Run Detail:** Matrix table with status badges, timing stats, scoring breakdowns by test/harness/model.
   - **Compare View:** Side-by-side diff with deltas (mirrors CLI `bench compare` output).
5. Add Recharts visualizations:
   - Pass rate bar chart by model/harness/test.
   - Timing distribution (box plot or histogram).
   - Frontier eval score scatter plot.
6. Static file loading only (no live updates during runs).
7. Responsive layout that works on desktop and tablet.

**shadcn Components to use:**
- Card, Table, Badge, Tabs, Select, Button
- Dialog for drill-down details
- Skeleton for loading states
- Charts from Recharts wrapped in shadcn styling

### Feature B — Harness Performance Optimizations

**Goal:** Reduce typical run time by 10-20%, clean up interfaces, and enable lower default timeouts.

#### B.1 — Goose Adapter Cleanup (`src/harnesses/goose-adapter.ts`)

Based on [official Goose documentation](https://block.github.io/goose/docs/guides/running-tasks/):

1. **Remove undocumented environment variables:**
   - Remove `GOOSE_MODE`, `GOOSE_CONTEXT_STRATEGY`, `GOOSE_MAX_TURNS` (not in official docs)
   - Keep `GOOSE_PROVIDER`, `GOOSE_MODEL`, `GOOSE_CLI_MIN_PRIORITY` (documented)

2. **Remove `--max-turns` CLI flag** (not in official docs, may be deprecated)

3. **Add `--output-format json`** for structured, parseable output

4. **Use stdin for prompts** (`-i -` instead of `-t`)
   - Avoids shell escaping issues with complex prompts
   - More robust for multi-line prompts

5. **Simplified command:**
   ```bash
   goose run --no-session --provider ollama --model <model> -q --output-format json -i -
   # Prompt piped via stdin
   ```

#### B.2 — OpenCode Adapter Cleanup (`src/harnesses/opencode-adapter.ts`)

Based on [official OpenCode documentation](https://opencode.ai/docs/cli/):

1. **Add `-q` (quiet) flag** - Suppresses non-response output for faster execution

2. **Add `--format json`** - Structured output for reliable parsing

3. **Simplified command:**
   ```bash
   opencode run "<prompt>" --model ollama/<model> --attach <url> -q --format json
   ```

#### B.3 — OpenCode Server Optimization (`src/harnesses/opencode-server.ts`)

Based on [OpenCode Server documentation](https://opencode.ai/docs/server/):

1. **Reduce health check polling interval** from 500ms to 200ms

2. **Implement exponential backoff** for health checks:
   - Start at 100ms, multiply by 1.5, cap at 500ms
   - Estimated gain: 1-2s for server startup

3. **Pre-warm server during plan building** (`src/runner/index.ts`)
   - Start `ensureServerRunning()` in parallel with plan build
   - Estimated gain: 1-5s for first OpenCode item

#### B.4 — Timeout Tuning (`src/lib/timeout.ts`)

1. **Scale OpenCode overhead by model size:**
   - Current: Fixed 240s regardless of model
   - New: `60s + (params/10 * 30s)`
   - 3B model: 69s instead of 240s
   - 30B model: 150s instead of 240s

2. **Lower minimum timeout:** 120s → 60s

3. **Add `--fast` flag** (optional)
   - Reduces all timeouts by 50%
   - Records flag in plan.json

#### B.5 — Runner Optimizations (`src/runner/index.ts`)

1. **Parallelize model discovery:**
   - Replace sequential `for` loop with `Promise.all()`
   - Estimated gain: 50-150ms

2. **Cache model parameter values:**
   - Fetch once per unique model
   - Share across harnesses

## Exit Criteria
- Dashboard renders run list, detail, and compare views with shadcn styling.
- Charts display pass rates, timing, and scores using Recharts.
- Harness optimizations reduce multi-harness run time by 10-20%.
- Lower default timeouts (60s min, scaled OpenCode overhead) work reliably.
- No regressions in run stability or result accuracy.
