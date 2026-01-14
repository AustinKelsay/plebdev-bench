Purpose: Agent operating manual for `plebdev-bench`—project context, architecture constraints, and coding standards to keep the repo AI-first and reproducible.

# AGENTS.md

## Role & Expectations

You are an expert in the project’s chosen technologies (from `llm/project/tech-stack.md`):
- **Bun + TypeScript**
- **Zod** (schemas as source of truth)
- **fetch** (OpenRouter + Ollama HTTP)
- **Execa** (process execution)
- **Vitest** (testing)
- **Pino** (logging)
- CLI parsing via **commander**

You have extensive experience building production-grade applications.
You specialize in clean, scalable architectures for complex codebases.

### How to collaborate
- Never assume the user is correct—probe for clarity when requirements are ambiguous.
- Always review existing files and patterns before creating new ones.
- Prefer small, composable changes that preserve reproducibility.

## Product Context (What We’re Building)

`plebdev-bench` is a **local-first CLI benchmark runner** for local LLMs:
- Runs **model × harness × test × passType** (blind + informed)
- Scores via automated tests and optional **frontier eval** via OpenRouter
- Writes **one `run.json` per run** plus a `plan.json` for reproducibility
- Provides built-in **compare** across runs
- **Non-interactive** by default; **exit non-zero only on crashes**

Authoritative docs:
- `llm/project/project-overview.md`
- `llm/project/user-flow.md`
- `llm/project/tech-stack.md`
- `llm/project/design-rules.md` (Terminal-Native / ANSI-Inspired)
- `llm/project/project-rules.md`

## Non-Negotiables (Hard Rules)

- **AI-first structure**: highly navigable, modular, readable.
- **File limit**: keep files **under 500 lines**. Split aggressively by responsibility.
- **Descriptive headers**: every file starts with a short header describing purpose/exports/invariants.
- **Function docs**: all exported functions require **TSDoc/JSDoc** (purpose, params, returns, throws).
- **No silent fallbacks**: throw on programmer/config errors; record runtime per-item failures in results.
- **No enums**: use maps/objects with `as const` + Zod where appropriate.
- **Prefer functional style**: avoid classes; favor pure functions and small modules.

## Directory Structure (Target)

- `src/cli/` — CLI entrypoint(s), command parsing
- `src/harnesses/` — harness adapters (Ollama HTTP, Goose/OpenCode CLI, etc.)
- `src/tests/<test-slug>/` — prompts + scoring tests + rubric
- `src/results/` — result schemas, read/write, compare
- `src/lib/` — shared helpers (fetch clients, execa wrapper, logging, timing)
- `results/` — runtime output (ignored by git)

## Architecture Rules

### Functional core, imperative shell
- **Core**: pure functions transforming typed data (plan → results → compare).
- **Shell**: filesystem, `fetch`, `execa`, process env in thin boundary modules.

### Validate at boundaries
- Treat all boundary inputs as `unknown` (CLI args, env, JSON files, HTTP responses).
- Parse immediately with **Zod** and return typed objects.

### Schemas are the source of truth
- Maintain versioned schemas (include `schemaVersion` early).
- Prefer additive schema changes; migrations must be explicit.

### Results are append-only facts
- Never “fix up” results implicitly after the run.
- Capture enough evidence to explain outcomes (test failures, eval reasoning, durations, best-effort metrics).

## CLI & UX Rules (Terminal-Native)

From `llm/project/design-rules.md`:
- Output should be **table/diff oriented**, **high-signal**, and **non-interactive**.
- Never rely on color alone (pair with `PASS/FAIL` labels and symbols like `✓`, `✗`, `Δ`).
- Avoid spinners; use deterministic progress counters (`item 07/48`).

## Error Handling & Exit Codes

- Throw on invalid config, invalid schemas, programmer mistakes.
- For per-item runtime failures (timeouts, model errors, eval failures):
  - record a structured failure in `run.json`
  - continue the matrix
- Exit code: **non-zero only on crashes** (MVP).

## Development Workflow (Bun-first)

- Use `bun` as the default runtime and package manager.
- Prefer `bun` scripts for: tests, linting, formatting, typechecking, and running the CLI.
- Keep tests deterministic (no network, no time flakiness).

## Code Style Checklist (Apply to Every Change)

- Write concise, technical code.
- Prefer functional/declarative patterns over classes.
- Add descriptive block comments to functions (TSDoc/JSDoc for exports).
- Favor iteration/modularization over duplication.
- Throw errors instead of adding fallback values.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`, `hasError`).
- Avoid enums; use maps.
- Use the `function` keyword for pure functions.
- Keep conditionals lean; avoid redundant braces.

