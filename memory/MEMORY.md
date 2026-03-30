# plebdev-bench Memory

## Project
Local LLM benchmark runner — CLI-driven test harness + scoring pipeline.
Stack: Bun + TypeScript, Zod, Vitest, Pino, Recharts (dashboard), React/Vite.

## Key Paths
- `src/` — CLI, runner, harnesses, runtimes, lib, schemas, tests
- `apps/dashboard/` — React dashboard (Vite + Tailwind + Recharts)
- `apps/dashboard/public/results/` — Published static run artifacts
- `results/` — Raw timestamped run outputs (plan.json + run.json)
- `llm/project/` — Canonical project docs (read before making changes)

## Dashboard Architecture
- Data source: static JSON files under `apps/dashboard/public/results/`
  - `index.json` — DashboardIndex listing all runs (v3 schema)
  - `<runId>/plan.json` + `<runId>/run.json` — Per-run artifacts
  - `aggregates/latest.json` — Latest checkpoint aggregate for leaderboard
  - `aggregates/<checkpointId>.json` — Per-checkpoint aggregates
- 4 pages: Leaderboard, Run List, Run Detail, About
- Key lib files: `src/lib/api.ts`, `src/lib/types.ts`, `src/lib/aggregations*.ts`

## Current Data State (as of 2026-03-30)
- Latest checkpoint: `chk_sha256v1_432187a085f7`
- 12 total runs indexed, 3 match latest checkpoint
- 1512 deduped items, 1 machine (Apple M4 Pro / 64GB)
- 24 models tested: qwen3.x, qwen2.5, devstral, gpt-oss:20b, etc.
- 3 harnesses: direct, goose, opencode
- 16 tests: smoke, calculator-*, todo-app, tool-smoke, rate-limiter, ttl-cache, event-emitter, workspace-*, file-*, targeted-edit, safe-cleanup
- Top models: gpt-oss:20b (98.5%), qwen3.5:27b (97.1%), devstral-small-2:24b / qwen3:8b (94.6%)
- Bottom: llama3.2:3b (18.9%), qwen3.5:0.8b (20.3%)

## Composite Score Formula
effectiveScore = passRate × 0.4 + completionRate × 0.3 + toolSuccessRate × 0.3

## Checkpoint System
- `src/lib/benchmark-checkpoint.ts` — SHA-256 hash of all test assets + core lib files
- Checkpoints roll when test prompts, scoring specs, or core pipeline code changes
- Leaderboard only shows runs matching the latest checkpoint

## Aggregation / Dedup Logic
- Best result per (machineInstanceId × matrixKey) across runs within a checkpoint
- Published via `bun dashboard:index` command
- Leaderboard uses `aggregates/latest.json` only

## User Preferences
- (none recorded yet)
