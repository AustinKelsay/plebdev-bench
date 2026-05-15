Purpose: Define engineering standards for `plebdev-bench` so the codebase stays AI-friendly: modular, readable, well documented, and reproducible.

# Project Rules

These rules are the **source of truth** for how we structure, write, and operate `plebdev-bench`.
They are optimized for:
- **AI-first development** (clear modules, stable interfaces, strong schemas)
- **CLI-first execution** (single command, non-interactive by default)
- **Reproducible benchmarking** (explicit Run Plans, stable Run Result formats, deterministic Run Comparisons)

## Directory Structure

### Top-level

- `src/` — application code (runner, harness adapters, schemas, utilities)
- `src/runtimes/` — Runtime adapters (inference backends: Ollama)
- `src/harnesses/` — Harness adapters (direct HTTP, Goose/OpenCode CLI) + tool-prompt builder
- `src/tests/` — Benchmark Test catalog (coding + computer-use tests, including workspace-scored fixtures) with Benchmark Categories (`coding`, `computer-use`)
- `src/results/` — Run Result schema + read/write helpers + Run Comparison logic
- `src/cli/` — CLI entrypoint(s) and argument parsing
- `src/lib/` — reusable helpers (scoring, code extraction, failure classification, logging, timing)
- `src/runner/` — orchestration, plan building, item execution
- `src/schemas/` — Zod schemas (config, plan, result, scoring, common)
- `apps/dashboard/` — React dashboard for browsing Run Results
  - `src/components/` — UI components (about, charts, leaderboard, run-detail, run-list, layout, ui)
  - `src/lib/` — types, API client, aggregations
  - `src/pages/` — route pages
  - `src/hooks/` — data fetching hooks
- `results/` — runtime output (timestamped directories containing a Run Result + Run Plan)
- `llm/` — planning docs (this folder)

### Benchmark test catalog (convention)

Each **Benchmark Test** lives in its own directory:

- `src/tests/<test-slug>/`
  - `test.meta.json` — required metadata (`category`, `scoringMode`, `requiresTools`, optional `description`/`tags`)
  - `README.md` — what the Benchmark Test is, what “pass” means
  - `prompt.blind.md` — blind prompt
  - `prompt.informed.md` — informed prompt
  - `rubric.md` — Frontier Eval rubric (if applicable)
  - `scoring.spec.ts` — Automated Score specification consumed by the scorer
  - `fixtures/` — optional inputs, golden files

Prompt contract convention (recommended across all Benchmark Tests):
- Require a single TypeScript module output with no prose/explanations
- Require exact named exports matching the scoring spec
- For tool-calling harnesses, treat prompt output as file contents (not chat text)
- Workspace-scored Benchmark Tests must assume the Harness runs inside an isolated fixture directory and must declare exact postconditions instead of code exports

### Results output layout (runtime)

- `results/<run-id>/`
  - `plan.json` — Run Plan with resolved config + expanded Matrix (reproducibility)
  - `run.json` — Run Result containing summary + all Matrix Items
  - `artifacts/` — optional large blobs (logs, generated code files) if we later avoid embedding in JSON

## Naming Conventions

### General
- **kebab-case** for directories and markdown files: `user-flow.md`, `todo-app/`
- **camelCase** for variables and functions: `hasApiKey`, `computeRunId`
- **PascalCase** for types/interfaces and React components: `MatrixItem`, `CompositeScoreChart.tsx`
- Avoid enums; use **maps/objects** with `as const` and Zod where appropriate.

### File names
- Use **descriptive** names over abbreviations.
- Prefer “what it is”:
  - `openrouter-client.ts` (not `or.ts`)
  - `ollama-client.ts` (not `ollama.ts` if it only holds HTTP)
  - `run-writer.ts`, `run-reader.ts`, `run-compare.ts`
- Suffix conventions:
  - `*.test.ts` — vitest tests
  - `*.schema.ts` — Zod schemas
  - `*-client.ts` — HTTP client modules
  - `*-adapter.ts` — harness adapters

### Function naming
- Use **verb-first** names that encode intent:
  - `buildRunPlan`, `executeMatrixItem`, `writeRunJson`, `compareRuns`
- Prefer boolean prefixes:
  - `isReady`, `hasApiKey`, `shouldEnableFrontierEval`

## File Size & Modularity (Hard Rule)

- **Max 500 lines per file**.
- If a file grows:
  - Split by responsibility (schema vs IO vs orchestration)
  - Move “pure transforms” into `src/lib/` or a sibling module
  - Avoid “god modules” (runner files should orchestrate, not implement everything)

## Code Organization Patterns

### 1) Functional core, imperative shell
- **Core logic**: pure functions operating on typed data (Run Plans, Run Results, Run Comparisons).
- **Shell**: IO boundaries (filesystem, execa, fetch, process env) kept in thin modules.
- Benefits: deterministic behavior, easier tests, easier AI edits without regressions.

### 2) Validate at boundaries (Zod everywhere)
- All inputs are `unknown` at boundaries:
  - CLI args, env vars, JSON files, HTTP responses, child process outputs
- Parse/validate immediately with Zod.
- Never let unvalidated data into the core pipeline.

### 3) Stable domain model (schemas are source of truth)
Create a small set of canonical, versioned schemas:
- `RunPlan` (expanded Matrix)
- `RunResult` (Benchmark Run-level summary + Matrix Item results)
- `MatrixItemResult` (generation, Automated Score, Frontier Eval, timing/token metadata when available)
- Include `schemaVersion` early.

### 4) Harness adapters are isolated and swappable
- Harnesses must share a common interface (inputs/outputs) so they can be compared fairly without blurring Runtime behavior.
- Keep Harness-specific quirks inside adapter modules:
  - request formatting
  - retries/timeouts
  - parsing responses
- Avoid leaking Harness-specific types into the runner.

### 5) Results are append-only facts
- Never “fix up” Run Results after the Benchmark Run except via explicit migrations.
- Store enough evidence to explain outcomes:
  - failing Benchmark Test output
  - Frontier Eval reasoning (if present)
  - timing + token metadata (when available)

### 6) Terminal-native UX constraints
From `design-rules.md`:
- Output must be **high-signal**, **table/diff oriented**, and **non-interactive** by default.
- Never rely on color-only meaning; pair with symbols/labels.
- Avoid spinners; prefer deterministic counters (`item 07/48`).

## Documentation Rules

### File headers (required)
Every file must start with a short header describing:
- Purpose of the module
- Key exports
- Any invariants or “gotchas”

### Function documentation (required)
- All exported functions require **TSDoc/JSDoc**:
  - purpose
  - parameters and return type meaning
  - error cases (what is thrown)
- Internal helpers should be documented when non-obvious.

### Error handling (required)
- Throw errors for programmer/config mistakes (invalid config, missing required fields).
- For runtime per-Matrix-Item failures (Runtime Model/Harness flakiness), record structured failures in Run Results and continue.
- **Exit code**: non-zero only on crashes (MVP).

## Testing Rules (Vitest)

- Prefer **deterministic tests**: no network, no time-based flakiness.
- Separate concerns:
  - Runner/library unit tests (fast, pure)
- Benchmark Test catalog scoring tests (validate generated code against specs)
- When adding a new Benchmark Test, include:
  - `test.meta.json` with a valid category (`coding` or `computer-use`), `scoringMode`, and `requiresTools` flag
  - `README.md` describing acceptance criteria
  - `prompt.blind.md` and `prompt.informed.md`
  - `rubric.md` for Frontier Eval (if applicable)
  - one `scoring.spec.ts` that defines either expected exports + executable test cases, or exact workspace assertions for filesystem tasks

## Development Workflow Expectations

### Local commands (Bun-first)
- Use `bun` scripts as the primary interface for:
  - formatting
  - linting
  - typechecking
  - tests
  - running the benchmark CLI

### Quality gates (minimum)
Before merging changes:
- `bun test` passes
- Type checks pass (prefer a dedicated script, even if Bun runs TS directly)
- Result schemas remain backwards compatible, or include a `schemaVersion` bump + migration plan

### Git / results hygiene
- `results/` is runtime output and should not be committed by default.
- Any committed fixtures belong in `src/tests/<test>/fixtures/`.

### Incremental delivery
- Favor small PRs that add one capability at a time:
  - new harness adapter
  - new benchmark test
  - result schema enhancement
  - compare improvements
- Always update docs (`llm/project/*`) when changing product assumptions.

## Required MVP Defaults (From User Flow)

- Single-command CLI; non-interactive by default
- Auto-discovery of Runtime Models and Harnesses
- Active Runtime fixed to Ollama until multi-Runtime execution is intentionally reintroduced
- Run Plan + one Run Result per Benchmark Run
- Frontier Eval auto-enabled when API key is present
