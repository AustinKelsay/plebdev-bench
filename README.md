# plebdev-bench

Local-first, CLI-driven benchmark runner for local LLMs.

## What it does

For each benchmark run, `plebdev-bench` executes a matrix:

- **runtime × harness × model × test × passType**
  - runtime: inference backend (e.g., Ollama)
  - harness: interface adapter (direct HTTP, Goose CLI, OpenCode CLI)
  - passType: **blind** + **informed**

Test categories:
- `coding`
- `computer-use`

Scoring:
- **Automated**: either imports generated code and runs scoring cases, or scores a seeded workspace against exact filesystem assertions.
- **Optional frontier eval**: rubric scoring via **OpenRouter** for code-module tests when an API key is present.

Outputs (per run):
- `results/<run-id>/plan.json` — resolved config + expanded matrix plan (reproducibility)
- `results/<run-id>/run.json` — single run JSON with summary + per-item details
- `results/<run-id>/run.partial.json` — periodic crash-safe snapshot during execution (removed on success)
- each artifact now includes:
  - benchmark checkpoint metadata (`checkpointId`, manifest hash, asset count)
  - machine instance identity + canonical machine profile metadata
  - run provenance metadata (`verificationStatus`, source)

Built-ins:
- **compare**: diff two runs and print deltas (pass rate, frontier eval, duration, status changes, etc.)
- **checkpointed aggregation**: `dashboard:index` builds latest-checkpoint leaderboard artifacts with machine-aware best-result selection

Model identity:
- `model` in each matrix row remains the exact runtime-specific identifier that executed.
- `modelProfile.canonical` groups equivalent variants under one logical benchmark model.
- `modelProfile.variant` preserves format, quantization, runtime, and source-specific details for drill-down.

Current benchmark tests:
- `smoke` — basic add function sanity check
- `tool-smoke` — code-output preflight for tool harnesses
- `calculator-basic` — stateless arithmetic operations
- `calculator-stateful` — chainable calculator + memory semantics
- `todo-app` — CRUD/stateful todo management
- `rate-limiter` — per-key fixed-window quota semantics
- `ttl-cache` — deterministic cache expiration and mutation semantics
- `event-emitter` — listener lifecycle and ordering semantics
- `workspace-tool-smoke` — read/write workspace preflight for computer-use harnesses with preseeded parent directories
- `file-search-smoke` — search preflight for harnesses that advertise workspace search
- `file-delete-smoke` — delete preflight for harnesses that advertise workspace delete
- `workspace-smoke` — create nested files in preseeded directories, rewrite `checklist/steps.txt` to the exact three-line final state, and emit `artifacts/summary.json`
- `file-locator` — search a noisy workspace and extract key values into one report
- `targeted-edit` — make one precise edit to a single existing file
- `workspace-reorg` — move files into a new directory structure and emit an index manifest
- `safe-cleanup` — delete only approved files and write an audit report

## Status

**MVP complete + hardening applied.** Multi-harness runs, automated scoring, frontier eval, compare, and dashboard are implemented.
The active benchmark runtime is currently **Ollama only**. Historical artifacts that contain `runtime: "vllm"` remain readable for compare/debug flows, but new runs no longer execute or auto-discover non-Ollama runtimes.
Authoritative docs live in `llm/project/` and `llm/implementation/`.

### Computer-Use Hardening Checkpoint (2026-03-13)

- Workspace tests now declare `requiredHarnessCapabilities`, and the plan builder skips invalid harness/test combinations instead of running impossible rows.
- Capability modeling now distinguishes plain workspace write access from directory creation via `workspace-mkdir`.
- Preflight coverage now includes `tool-smoke`, `workspace-tool-smoke`, `file-search-smoke`, and `file-delete-smoke`.
- Goose has separate workspace turn budgets so computer-use tasks are no longer constrained by the old code-output defaults.
- Workspace prompts now anchor tool harnesses inside the seeded fixture; Goose includes the resolved workspace root path, while OpenCode omits the absolute root and uses relative-only path instructions.
- OpenCode workspace runs expose `read`, `glob`, `grep`, and `bash`, so search/delete benchmarks now measure model behavior instead of missing tool affordances.
- OpenCode now runs with per-item generated config, `--pure`, explicit `--dir`, `enabled_providers`, denied `external_directory` access, and prompts use relative-only paths (no absolute workspace root) so benchmark rows do not depend on user-global OpenCode config.
- Generation now retries a single `harness_error` once on a fresh workspace before the row is recorded as failed.
- Tests can declare `timeoutMultiplier` in `test.meta.json`, and the longer coding tasks now ship with higher calibrated multipliers so valid slow generations are less likely to be recorded as timeouts.
- Run summaries now distinguish semantic scored-check pass rate from full item success rate and scored-row coverage.
- Validation run `20260313-090646-1a74da` confirmed that previously invalid OpenCode delete/search tasks now execute as normal scored items; one transient `harness_error` was isolated to a single `workspace-smoke` blind run and did not reproduce in rerun `20260313-092934-851223`.

## Tech stack

- **Bun + TypeScript**
- **Zod** (schemas are the source of truth)
- **fetch** (OpenRouter + Ollama HTTP)
- **Execa** (process execution)
- **Vitest** (testing)
- **Pino** (logging)
- CLI parsing via **commander**

See `llm/project/tech-stack.md` for best practices and pitfalls.

## Key conventions (non-negotiables)

- **CLI-first, single-command, non-interactive** by default (script-friendly).
- **Exit code**: non-zero **only on crashes** (test/model failures are recorded in results).
- **Results are append-only facts**:
  - never silently “fix up” results after the run
  - record enough evidence to explain outcomes
- **Secrets hygiene**:
  - OpenRouter API key is read from env only
  - redacted in logs
  - never written to results
- **Terminal-Native / ANSI-Inspired UX**:
  - table/diff oriented output
  - never rely on color alone (pair with labels/symbols like `PASS/FAIL`, `✓`, `✗`, `Δ`)
  - avoid spinners; use deterministic progress counters
- **AI-first codebase rules**:
  - keep files **< 500 lines**
  - every file has a short header (purpose/exports/invariants)
  - all exported functions have **TSDoc/JSDoc**
  - prefer functional modules; avoid classes
  - avoid enums; use `as const` maps + Zod

See `llm/project/project-rules.md` and `AGENTS.md`.

## Project layout (target)

- `src/cli/` — CLI entrypoint(s), command parsing
- `src/runtimes/` — runtime adapters (inference backends like Ollama)
- `src/harnesses/` — harness adapters (direct HTTP, Goose/OpenCode CLI)
- `src/tests/<test-slug>/` — prompts + scoring tests + rubric
  - includes `test.meta.json` for category metadata, scoring mode, `tags`, `requiredHarnessCapabilities`, and optional `timeoutMultiplier`
- `src/results/` — result schemas, read/write, compare
- `src/lib/` — shared helpers (fetch clients, execa wrapper, logging, timing)
- `results/` — local runtime output (ignored by git)
- `apps/dashboard/public/results/` — published runs for the hosted dashboard (tracked)
- `llm/` — planning docs (project overview, user flow, tech stack, design rules, phases)

## Quickstart

### Prerequisites

1. Install Bun: https://bun.sh
2. Install Ollama: https://ollama.ai
3. Pull a model: `ollama pull llama3.2:3b`
4. Start Ollama: `ollama serve`

### Install & Run

```bash
# Install dependencies
bun install

# Run benchmarks (Ollama-only; auto-discovers models, harnesses, and tests)
bun pb

# Run with specific options
bun pb --models llama3.2:3b --tests smoke --pass-types blind

# Run with explicit machine instance metadata (recommended for shared aggregation)
bun pb --machine-instance-id inst-abc123 --machine-display-label "Austin Mac Mini"

# Run only coding category tests
bun pb --categories coding

# Run only computer-use tests on tool harnesses
bun pb --categories computer-use --harnesses goose opencode

# Run with explicit runtime and harness
bun pb --runtimes ollama --harnesses direct
```

## Dashboard: publish runs for hosting

The dashboard is a static Vite app under `apps/dashboard/`. It loads runs from static JSON at `/results/*`.

To publish a run (writes output directly into the tracked published folder):

```bash
bun run src/index.ts run -o apps/dashboard/public/results
bun dashboard:index
git add apps/dashboard/public/results
git commit -m "Publish run <runId>"
git push
```

To run locally (unpublished output in `results/`):

```bash
bun pb
```

### Model Profiles

Use `--model-config <file>` to define canonical benchmark models and preserve richer metadata for the Ollama model names you execute. The canonical profile gives you one stable model identity in plans, run artifacts, compare output, and dashboard grouping.

Example file:

```json
{
  "schemaVersion": "0.5.2",
  "models": {
    "qwen3-27b-instruct": {
      "profileLabel": "Qwen 3 27B Instruct",
      "family": "qwen3",
      "parametersBillions": 27,
      "tuning": "instruct",
      "variants": {
        "ollama": {
          "modelName": "qwen3:27b",
          "variantLabel": "Qwen 3 27B Ollama",
          "format": "GGUF"
        }
      }
    }
  }
}
```

Legacy alias-only files and `--model-alias "name=runtime:model,..."` still work. They are normalized into the new model-profile shape automatically, but new configs should prefer `models` (legacy `modelProfiles` are accepted and normalized too).

### Long-Run Stability

- Scoring is process-isolated by default to avoid Bun memory growth from repeated dynamic imports during long runs.
- The scorer worker now gets a 15s default budget plus startup overhead, reducing false negatives from slow-but-valid scoring setup.
- Override mode (debugging only): `PLEBDEV_BENCH_SCORER_MODE=in-process bun pb ...`
- During execution, the runner writes periodic snapshots to `results/<run-id>/run.partial.json` and removes it after a successful final write.
- If the process crashes, inspect `run.partial.json` for recovered progress.
- Harness-level `harness_error` rows are retried once automatically. For workspace rows, the retry runs on a freshly seeded workspace.
- OpenCode rows generate isolated config per item and should not require manually adding benchmark models to `~/.config/opencode/opencode.json`.
- Goose headless turn controls:
  - `--goose-max-turns <n>` controls first attempt turns (default: `1`)
  - `--goose-retry-max-turns <n>` controls retry turns after off-task/turn-limit output (default: `3`)
  - `--goose-retry-max-turns` must be greater than or equal to `--goose-max-turns`
  - `--goose-workspace-max-turns <n>` controls first-attempt workspace turns (default: `8`)
  - `--goose-workspace-retry-max-turns <n>` controls workspace retry turns (default: `12`)
  - `--goose-workspace-retry-max-turns` must be greater than or equal to `--goose-workspace-max-turns`

## Core CLI Commands

```bash
# Compare two runs
bun run src/index.ts compare <run-a> <run-b>

# Force compare across checkpoint mismatches (normally blocked)
bun run src/index.ts compare <run-a> <run-b> --allow-cross-checkpoint

# Rewrite legacy artifacts to the standardized machine-profile schema
bun run src/index.ts migrate-machine-profiles --dir apps/dashboard/public/results --rebuild-dashboard-index --dashboard-output-dir apps/dashboard/public/results

# Run tests
bun test

# Type check
bun run typecheck
```

### Output

Each run creates:
- `results/<run-id>/plan.json` — expanded matrix plan
- `results/<run-id>/run.json` — execution results
- `results/<run-id>/run.partial.json` — periodic in-flight checkpoint (deleted after successful completion)

Machine metadata now splits:
- `machine.instanceId` — stable per-machine identity, never derived from hardware
- `machine.profileKey` — canonical normalized hardware class used for aggregation
- `machine.observedHardware` — exact sanitized hardware facts retained for audit/debug

Model metadata now splits:
- `item.model` — exact runtime-specific model identifier used for generation
- `item.modelProfile.canonical.profileKey` — stable logical model identity used for cross-runtime matching
- `item.modelProfile.variant` — runtime-specific artifact metadata such as format and quantization

## Interpreting Results Fairly

- Prefer comparing runs by delta, not by single absolute scores.
- Re-run the same matrix when evaluating prompt changes, then compare run pairs.
- Workspace scores are only comparable when the same capability-qualified matrix is used; do not compare pre-hardening computer-use runs against post-hardening runs as if the matrices were equivalent.
- Read/write-only workspace tests must keep parent directories preseeded in fixtures; if a task needs to create missing directories, it must declare `workspace-mkdir`.
- Treat preflight failures as harness slice failures first. If a preflight fails, the skipped rows behind it should not be interpreted as model evidence.
- Treat `harness_error` items as infrastructure or harness-reliability signals. The runner already retries them once automatically; only repeated failures should be treated as stable evidence.
- Treat harness-level no-output/tool-call failures as harness reliability signals, not always model capability signals.
- Read the CLI summary carefully:
  - `Semantic pass rate` is scored-check pass rate on rows that reached scoring
  - `Item success rate` is full end-to-end row success across the whole scheduled matrix
  - `Scored rows` shows how much of the matrix actually reached scoring
- Use `direct` harness as the baseline for prompt-level changes, and treat Goose/OpenCode as additional realism/stress layers.

## Docs

- `llm/project/project-overview.md` — product definition
- `llm/project/user-flow.md` — persona flows + CLI states
- `llm/project/tech-stack.md` — stack + best practices
- `llm/project/design-rules.md` — Terminal-Native design rules
- `llm/project/project-rules.md` — engineering standards
- `llm/implementation/review-and-hardening-implementation.md` — threat model + hardening notes
- `llm/implementation/computer-use-hardening.md` — current computer-use scheduling, preflight, and scoring-interpretation rules
- `llm/implementation/release-readiness-checklist.md` — release checklist and sign-off
- `llm/implementation/multi-runtime-mvp-implementation.md` — historical multi-runtime MVP notes (kept for artifact context only)

## Hosted dashboard (how it works)

The hosted dashboard is a static frontend that reads run data from static JSON files committed to git.

High level:
- Bench runs produce `plan.json` + `run.json` in an output directory.
- Published runs live in `apps/dashboard/public/results/<runId>/`.
- An index (`apps/dashboard/public/results/index.json`) is generated from the published runs.
  - `machineProfileKey` is the canonical machine-profile identifier; `machineProfileId` is still emitted as a deprecated compatibility alias and will be removed in a future release.
- Checkpoint aggregate artifacts are generated in `apps/dashboard/public/results/aggregates/`:
  - `<checkpointId>.json` for each discovered checkpoint
  - `latest.json` for the checkpoint computed from current benchmark source
- The dashboard fetches:
  - `/results/index.json` (run list)
  - `/results/<runId>/run.json` and `/results/<runId>/plan.json` (details)
  - `/results/aggregates/latest.json` (leaderboard)

Local vs hosted:
- Local dev: Vite serves the app and serves `/results/*` from the filesystem.
- Hosted (Vercel): Vite copies `apps/dashboard/public/*` into `apps/dashboard/dist/*`, so `/results/*` is just static files.

Design constraints:
- Runs are treated as append-only facts: publishing is a copy/commit action, not a mutation of prior runs.
- The dashboard validates fetched JSON at the boundary (Zod) and fails loudly on schema mismatch.
- Latest leaderboard view is strict to the currently computed benchmark checkpoint.
- Checkpoint aggregates group by machine + runtime + model + harness + test + passType, prefer the strongest result for each key, and only use recency as a later tiebreaker.
- Legacy runs (missing checkpoint/machine metadata) remain visible in run history and are excluded from latest-checkpoint leaderboard aggregation.

## Hosted dashboard (what we implemented)

Published results:
- Source of truth: `apps/dashboard/public/results/`
- Example published run snapshot: `apps/dashboard/public/results/20260209-080211-751e64/`
- Index generator: `apps/dashboard/scripts/build-index.ts`
  - Default scan/output dir: `apps/dashboard/public/results`
  - Optional override: `--dir <path>` (resolved from repo root cwd)

Dashboard fetching:
- Fetch base path is computed from `import.meta.env.BASE_URL` so it works under a subpath deploy.
- Fetch implementation: `apps/dashboard/src/lib/api.ts`

Git hygiene:
- Local output ignored: `results/*` in `.gitignore`
- Build artifacts ignored: `apps/dashboard/dist/` and `apps/dashboard/tsconfig.tsbuildinfo`

Vercel routing:
- `vercel.json` rewrites non-file routes to `index.html` for React Router deep links.
- Static `/results/*` remains directly fetchable.

Vercel build configuration (recommended):
- Install: `bun install`
- Build: `bun run --cwd apps/dashboard build`
- Output: `apps/dashboard/dist`
