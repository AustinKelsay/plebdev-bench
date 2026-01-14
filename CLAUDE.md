Purpose: Claude-specific agent instructions for `plebdev-bench`—how to work in this repo, what to optimize for, and what to avoid.

# claude.md

## Read this first (context)

Before making changes, read the canonical project docs:
- `llm/project/project-overview.md`
- `llm/project/user-flow.md`
- `llm/project/tech-stack.md`
- `llm/project/design-rules.md`
- `llm/project/project-rules.md`

If a request conflicts with these docs, ask clarifying questions before implementing.

## Stack (authoritative)

Assume the project uses:
- **Bun + TypeScript**
- **Zod** for schemas/validation
- **fetch** for OpenRouter + Ollama HTTP
- **Execa** for process execution
- **Vitest** for tests
- **Pino** for logging
- **commander** for CLI parsing

## Product constraints (MVP)

- CLI-first, **single-command**, **non-interactive**
- Auto-discovery of models/harnesses by default
- Write `results/<run-id>/plan.json` + **one** `results/<run-id>/run.json`
- Frontier eval auto-enabled if OpenRouter API key is present; failures must not crash the run
- Exit code **non-zero only on crashes**
- Built-in compare between runs

## Coding standards (hard rules)

- Keep files under **500 lines**; split by responsibility.
- Every file begins with a short header (purpose/exports/invariants).
- All exported functions have **TSDoc/JSDoc** (purpose, params, returns, throws).
- Prefer functional modules; avoid classes.
- Throw errors for programmer/config issues; record runtime failures in results and continue.
- Avoid enums; use maps/objects (`as const`) + Zod.

## Terminal-native UX rules

- Output should be **table/diff oriented**, concise, and deterministic.
- Never rely on color alone; use labels/symbols (`PASS/FAIL`, `✓`, `✗`, `Δ`).
- Avoid spinners; use progress counters (`item 07/48`).

## How to structure new code

- Put IO boundaries in thin modules:
  - HTTP clients: `src/lib/*-client.ts`
  - process execution: `src/lib/exec.ts`
  - filesystem read/write: `src/results/*`
- Keep orchestration small:
  - runner composes helpers; helpers do the work.
- Validate at boundaries with Zod and pass typed data inward.

## What to do when unsure

- Ask 1–3 pointed questions.
- Prefer minimal, reversible MVP decisions.
- Leave “hooks” (interfaces + schemas) so later improvements don’t require rewrites.

