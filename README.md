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

**MVP complete + hardening applied.** Multi-harness runs, automated scoring, frontier eval, compare, and dashboard are implemented.
Authoritative docs live in `llm/project/` and `llm/implementation/`.

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
- `src/harnesses/` — harness adapters (Ollama HTTP, Goose/OpenCode CLI, etc.)
- `src/tests/<test-slug>/` — prompts + scoring tests + rubric
- `src/results/` — result schemas, read/write, compare
- `src/lib/` — shared helpers (fetch clients, execa wrapper, logging, timing)
- `results/` — runtime output (ignored by git)
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

# Compare two runs
bun run bench compare <run-a> <run-b>

# Run tests
bun test

# Type check
bun run typecheck
```

### Output

Each run creates:
- `results/<run-id>/plan.json` — expanded matrix plan
- `results/<run-id>/run.json` — execution results

## Docs

- `llm/project/project-overview.md` — product definition
- `llm/project/user-flow.md` — persona flows + CLI states
- `llm/project/tech-stack.md` — stack + best practices
- `llm/project/design-rules.md` — Terminal-Native design rules
- `llm/project/project-rules.md` — engineering standards
- `llm/implementation/review-and-hardening-implementation.md` — threat model + hardening notes
- `llm/implementation/release-readiness-checklist.md` — release checklist and sign-off
