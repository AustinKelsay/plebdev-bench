Purpose: Define engineering standards for `plebdev-bench` so the codebase stays AI-friendly: modular, readable, well documented, and reproducible.

# Project Rules

These rules are the **source of truth** for how we structure, write, and operate `plebdev-bench`.
They are optimized for:
- **AI-first development** (clear modules, stable interfaces, strong schemas)
- **CLI-first execution** (single command, non-interactive by default)
- **Reproducible benchmarking** (explicit plans, stable result formats, deterministic comparisons)

## Directory Structure

### Top-level (target)

- `src/` — application code (runner, harness adapters, schemas, utilities)
- `src/harnesses/` — harness adapters (Ollama HTTP, Goose/OpenCode CLI, etc.)
- `src/tests/` — benchmark test catalog (prompts + scoring tests + rubric metadata)
- `src/results/` — result schema + read/write helpers + compare logic
- `src/cli/` — CLI entrypoint(s) and argument parsing
- `src/lib/` — reusable helpers (fetch clients, execa wrappers, logging, timing)
- `results/` — runtime output (timestamped directories containing `run.json` + `plan.json`)
- `llm/` — planning docs (this folder)

### Benchmark test catalog (convention)

Each benchmark test lives in its own directory:

- `src/tests/<test-slug>/`
  - `README.md` — what the test is, what “pass” means
  - `prompt.blind.md` — blind prompt
  - `prompt.informed.md` — informed prompt
  - `rubric.md` — frontier-eval rubric (if applicable)
  - `scoring.test.ts` — automated scoring tests (vitest/jest style, but we use vitest)
  - `fixtures/` — optional inputs, golden files

### Results output layout (runtime)

- `results/<run-id>/`
  - `plan.json` — resolved config + expanded matrix plan (reproducibility)
  - `run.json` — single JSON file containing summary + all matrix items
  - `artifacts/` — optional large blobs (logs, generated code files) if we later avoid embedding in JSON

## Naming Conventions

### General
- **kebab-case** for directories and markdown files: `user-flow.md`, `todo-app/`
- **camelCase** for variables and functions: `hasApiKey`, `computeRunId`
- **PascalCase** only for types/interfaces and (rare) exported constants that represent “entities”
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
- **Core logic**: pure functions operating on typed data (plans, results, comparisons).
- **Shell**: IO boundaries (filesystem, execa, fetch, process env) kept in thin modules.
- Benefits: deterministic behavior, easier tests, easier AI edits without regressions.

### 2) Validate at boundaries (Zod everywhere)
- All inputs are `unknown` at boundaries:
  - CLI args, env vars, JSON files, HTTP responses, child process outputs
- Parse/validate immediately with Zod.
- Never let unvalidated data into the core pipeline.

### 3) Stable domain model (schemas are source of truth)
Create a small set of canonical, versioned schemas:
- `RunPlan` (expanded matrix)
- `RunResult` (run-level summary + per-item results)
- `MatrixItemResult` (generation, tests, frontier eval, resource metrics)
- Include `schemaVersion` early.

### 4) Harness adapters are isolated and swappable
- Harnesses must share a common interface (inputs/outputs) so they can be compared fairly.
- Keep harness-specific quirks inside adapter modules:
  - request formatting
  - retries/timeouts
  - parsing responses
- Avoid leaking harness-specific types into the runner.

### 5) Results are append-only facts
- Never “fix up” results after the run except via explicit migrations.
- Store enough evidence to explain outcomes:
  - failing test output
  - frontier eval reasoning (if present)
  - timing + resource metrics (best-effort)

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
- For runtime per-item failures (model/harness flakiness), record structured failures in results and continue.
- **Exit code**: non-zero only on crashes (MVP).

## Testing Rules (Vitest)

- Prefer **deterministic tests**: no network, no time-based flakiness.
- Separate concerns:
  - Runner/library unit tests (fast, pure)
  - Test-catalog scoring tests (validate generated code against specs)
- When adding a new benchmark test, include:
  - `README.md` describing acceptance criteria
  - at least one `scoring.test.ts` that enforces the spec

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
- Auto-discovery of models/harnesses
- `plan.json` + one `run.json` per run
- Frontier eval auto-enabled when API key is present
- Best-effort resource metrics; never fail runs because metrics are unavailable

