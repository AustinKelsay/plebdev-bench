Purpose: Setup phase plan (barebones but running) for `plebdev-bench`.

# Setup Phase

Ship a minimal, running CLI that can execute a single-item benchmark and write reproducible artifacts (`plan.json` + one `run.json`).

## Goals
- Establish the Bun-first repo, scripts, and local dev workflow.
- Implement a thin vertical slice: `bench run` → generate (Ollama) → write `results/<run-id>/{plan.json,run.json}`.
- Lock in the result schema and directory conventions early (schema-first).

## Scope
- In scope: CLI skeleton, schemas, one harness (Ollama HTTP), a minimal test stub, file output.
- Out of scope: full matrix runs, frontier eval via OpenRouter, rich compare UX, performance tuning.

## Steps (per feature)

### Feature A — Repo/tooling baseline (Bun-first)
1. Add Bun project scaffolding (package.json, scripts) and TypeScript config.
2. Add Vitest with a single deterministic “smoke” test.
3. Add basic lint/format tooling (keep minimal; prefer correctness over heavy rules).
4. Add `pino` logger wired for human-readable output by default.

### Feature B — Schemas + domain model (Zod as source of truth)
1. Define Zod schemas for:
   - `BenchConfig` (local-only config, auto-discovery toggles)
   - `RunPlan` (expanded matrix plan)
   - `RunResult` (one `run.json` per run, with summary + item list)
2. Add `schemaVersion` fields immediately and document the stability expectations.
3. Create typed helpers: parse config, generate plan, and validate written results.

### Feature C — CLI skeleton (single-command, non-interactive)
1. Implement `bench` CLI with `commander`, including:
   - `bench run` (required for setup)
   - `bench compare` stub (prints “not implemented yet” but validates args shape)
2. Ensure `bench run` is non-interactive and prints:
   - a short plan summary
   - deterministic progress counters
   - the output path to `results/<run-id>/`
3. Ensure exit code is non-zero only on crashes.

### Feature D — Thin vertical slice: Ollama HTTP generation + result writing
1. Implement a minimal `ollama-client` using `fetch`:
   - ping/health check (best-effort)
   - list models (auto-discovery)
   - generate completion (non-streaming for setup)
2. Implement a single “smoke” benchmark test under `src/tests/<test>/`:
   - `prompt.blind.md` + `prompt.informed.md`
   - `README.md` describing what it is
   - `scoring.test.ts` can be a placeholder in setup (MVP will make it real)
3. Implement run execution for **one** matrix item (one model, one test, one passType).
4. Write `results/<run-id>/plan.json` and `results/<run-id>/run.json` with validated schemas.

### Feature E — Docs alignment
1. Update root `README.md` quickstart section to match the implemented CLI.
2. Add a short `llm/implementation/` note capturing the result schema and IO boundaries (optional but recommended).

## Exit Criteria
- `bun test` runs and passes.
- `bun run bench run ...` produces `results/<run-id>/plan.json` + one `run.json`.
- `run.json` validates against Zod schema and includes a clear failure shape for per-item errors.
- Docs updated to match what actually runs.

## Suggested Agent Prompt
```
Update @llm/project/phases/setup-phase.md with project-specific steps.
Keep scope minimal and shippable. List 3-5 actionable steps per feature.
```
