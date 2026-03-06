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
- **Automated**: runs a test suite against generated code (Vitest).
- **Optional frontier eval**: rubric scoring via **OpenRouter** (auto-enabled when API key is present).

Outputs (per run):
- `results/<run-id>/plan.json` — resolved config + expanded matrix plan (reproducibility)
- `results/<run-id>/run.json` — single run JSON with summary + per-item details
- `results/<run-id>/run.partial.json` — periodic crash-safe snapshot during execution (removed on success)
- each artifact now includes:
  - benchmark checkpoint metadata (`checkpointId`, manifest hash, asset count)
  - machine profile + sanitized hardware metadata
  - run provenance metadata (`verificationStatus`, source)

Built-ins:
- **compare**: diff two runs and print deltas (pass rate, rubric, time/energy, etc.)
- **checkpointed aggregation**: `dashboard:index` builds latest-checkpoint leaderboard artifacts

Current benchmark tests:
- `smoke` — basic add function sanity check
- `tool-smoke` — tool-calling preflight for tool harnesses
- `calculator-basic` — stateless arithmetic operations
- `calculator-stateful` — chainable calculator + memory semantics
- `todo-app` — CRUD/stateful todo management
- `rate-limiter` — per-key fixed-window quota semantics
- `ttl-cache` — deterministic cache expiration and mutation semantics
- `event-emitter` — listener lifecycle and ordering semantics

## Status

**MVP complete + hardening applied.** Multi-harness runs, automated scoring, frontier eval, compare, and dashboard are implemented.
Authoritative docs live in `llm/project/` and `llm/implementation/`.

### Multi-Runtime MVP Checkpoint (2026-02-08)

- Runtime matrix validated across `ollama` and `vllm` with harnesses `direct`, `goose`, and `opencode`.
- Benchmark run `20260208-122510-cb6911` completed `53/54` items with `91.2%` overall pass rate.
- Dashboard can be hosted as a static frontend that reads published run data from `apps/dashboard/public/results/index.json`.
- Implementation details and operational notes: `llm/implementation/multi-runtime-mvp-implementation.md`.
- vLLM local setup notes (OrbStack/Docker, memory sizing, troubleshooting): `llm/implementation/vllm-orbstack-setup.md`.

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
  - includes `test.meta.json` for category metadata
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

# Run benchmarks (auto-discovers models and tests)
bun pb

# Run with specific options
bun pb --models llama3.2:3b --tests smoke --pass-types blind

# Run with explicit machine identity metadata (recommended for shared aggregation)
bun pb --machine-id mac-mini-m4-pro --machine-label "Austin Mac Mini"

# Run only coding category tests
bun pb --categories coding

# Run with specific runtime and harness
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

### Managed vLLM Lifecycle (Single Run)

If you want a single run that starts vLLM only when needed (after the Ollama segment) and stops it afterward to free memory:

```bash
cd /path/to/plebdev-bench

bun pb \
  --runtimes ollama vllm \
  --harnesses direct goose opencode \
  --timeout 900000 \
  --manage-vllm \
  --vllm-model "Qwen/Qwen2.5-14B-Instruct" \
  --vllm-compose-file docker/vllm/docker-compose.yml \
  --vllm-startup-timeout 1800000
```

Optional: start/stop OrbStack around the vLLM segment too (disruptive if you use OrbStack for other containers):

```bash
  --manage-orbstack \
  --orbctl-path orbctl
```

Full vLLM setup/troubleshooting: `llm/implementation/vllm-orbstack-setup.md`.

### Long-Run Stability

- Scoring is process-isolated by default to avoid Bun memory growth from repeated dynamic imports during long runs.
- Override mode (debugging only): `PLEBDEV_BENCH_SCORER_MODE=in-process bun pb ...`
- During execution, the runner writes periodic snapshots to `results/<run-id>/run.partial.json` and removes it after a successful final write.
- If the process crashes, inspect `run.partial.json` for recovered progress.
- Goose headless turn controls:
  - `--goose-max-turns <n>` controls first attempt turns (default: `1`)
  - `--goose-retry-max-turns <n>` controls retry turns after off-task/turn-limit output (default: `3`)
  - `--goose-retry-max-turns` must be greater than or equal to `--goose-max-turns`

## Core CLI Commands

```bash
# Compare two runs
bun run src/index.ts compare <run-a> <run-b>

# Force compare across checkpoint mismatches (normally blocked)
bun run src/index.ts compare <run-a> <run-b> --allow-cross-checkpoint

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

## Interpreting Results Fairly

- Prefer comparing runs by delta, not by single absolute scores.
- Re-run the same matrix when evaluating prompt changes, then compare run pairs.
- Treat harness-level no-output/tool-call failures as harness reliability signals, not always model capability signals.
- Use `direct` harness as the baseline for prompt-level changes, and treat Goose/OpenCode as additional realism/stress layers.

## Docs

- `llm/project/project-overview.md` — product definition
- `llm/project/user-flow.md` — persona flows + CLI states
- `llm/project/tech-stack.md` — stack + best practices
- `llm/project/design-rules.md` — Terminal-Native design rules
- `llm/project/project-rules.md` — engineering standards
- `llm/implementation/review-and-hardening-implementation.md` — threat model + hardening notes
- `llm/implementation/release-readiness-checklist.md` — release checklist and sign-off
- `llm/implementation/multi-runtime-mvp-implementation.md` — detailed multi-runtime MVP implementation and validation notes

## Hosted dashboard (how it works)

The hosted dashboard is a static frontend that reads run data from static JSON files committed to git.

High level:
- Bench runs produce `plan.json` + `run.json` in an output directory.
- Published runs live in `apps/dashboard/public/results/<runId>/`.
- An index (`apps/dashboard/public/results/index.json`) is generated from the published runs.
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
