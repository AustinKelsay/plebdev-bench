# plebdev-bench

Local-first, CLI-driven benchmark runner for local LLMs.

## What it does

For each benchmark run, `plebdev-bench` executes a matrix:

- **model × harness × test × passType**
  - passType: **blind** + **informed**

Scoring:
- **Automated**: runs a test suite against generated code (Vitest).
- **Optional frontier eval**: rubric scoring via **OpenRouter** (auto-enabled when API key is present).

Outputs (per run):
- `results/<run-id>/plan.json` — resolved config + expanded matrix plan (reproducibility)
- `results/<run-id>/run.json` — single run JSON with summary + per-item details

Built-ins:
- **compare**: diff two runs and print deltas (pass rate, rubric, time/energy, etc.)

## Status

This repo is currently **docs-first** (bootstrapping the spec and conventions before implementation).
Authoritative docs live in `llm/project/`.

## Tech stack (MVP)

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
- `src/harnesses/` — harness adapters (Ollama HTTP, Goose/OpenCode CLI, etc.)
- `src/tests/<test-slug>/` — prompts + scoring tests + rubric
- `src/results/` — result schemas, read/write, compare
- `src/lib/` — shared helpers (fetch clients, execa wrapper, logging, timing)
- `results/` — runtime output (ignored by git)
- `llm/` — planning docs (project overview, user flow, tech stack, design rules, phases)

## Quickstart (when implementation lands)

Prereqs:
- Install Bun: `https://bun.sh`
- Local model runtime: Ollama (local HTTP)
- Optional: OpenRouter API key for frontier eval

Common commands (planned):
- `bun run bench run` — run the full matrix (non-interactive)
- `bun run bench compare <run-a> <run-b>` — diff two runs
- `bun test` — run tests

## Docs

- `llm/project/project-overview.md` — product definition
- `llm/project/user-flow.md` — persona flows + CLI states
- `llm/project/tech-stack.md` — stack + best practices
- `llm/project/design-rules.md` — Terminal-Native design rules
- `llm/project/project-rules.md` — engineering standards

