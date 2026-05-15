# Project Overview

## Snapshot
- **Project:** plebdev-bench — local LLM benchmark runner
- **Type:** CLI-driven test harness + scoring pipeline
- **Scope:** Local models on M4 Pro Mac mini (64GB) only (for now)
- **Modeling:** Blind vs informed runs for each test

## Mission & Outcomes
Build a simple, repeatable way to benchmark local LLMs across multiple harnesses and test types. Success means consistent runs, comparable scores, and clean, inspectable results for every model/harness/test combination.

## Core Objectives
- Test every model against every harness for each test
- Support category-based test selection (`coding`, `computer-use`)
- Run two passes per test: **blind** (no hints) and **informed** (test name/definition)
- Score with both automated test suites and a frontier-eval rubric
- Store results in a stable, machine-readable format for analysis

## Audience
- **Local LLM builders** comparing models on real tasks
- **Tooling developers** evaluating harness quality and reliability
- **Experimenters** tracking progress over time

## What It Tests
- **13 benchmark tests:**
  - `smoke` - Basic add() function (simplest possible test)
  - `calculator-basic` - Stateless arithmetic functions
  - `calculator-stateful` - Calculator with memory operations
  - `todo-app` - CRUD todo manager with state management
  - `tool-smoke` - Tool-calling preflight test for Goose/OpenCode
  - `rate-limiter` - Stateful per-key fixed-window rate limiting
  - `ttl-cache` - Deterministic in-memory TTL cache behavior
  - `event-emitter` - Listener lifecycle and event isolation semantics
  - `workspace-smoke` - Create `logs/session.log`, rewrite `checklist/steps.txt` to its exact three-line final state, and emit `artifacts/summary.json`
  - `file-locator` - Search a bounded workspace and extract values into a report
  - `targeted-edit` - Make one precise edit without collateral file changes
  - `workspace-reorg` - Move files into a required directory structure
  - `safe-cleanup` - Delete only approved files and emit an audit report
- Expandable test catalog over time

## Test Categories
- `coding` — implementation-focused developer tasks (current catalog default)
- `computer-use` — bounded machine/sandbox orchestration tasks

## Scoring & Evaluation
- **Automated:** either import generated code and run scoring-spec test cases, or compare a seeded workspace against exact filesystem assertions → pass/fail/total
- **Frontier eval:** send code + rubric to GPT-5.4 via OpenRouter for code-module tests → score 1–10 + reasoning

## Architecture & Stack (High Level)
- **Language:** TypeScript
- **Runtimes:** inference backends (currently Ollama only for active execution)
- **Harnesses:** adapters (direct, goose, opencode) that call CLIs/APIs
- **Results:** JSON files per run
- **Runner:** orchestrates generation + automated tests + frontier eval

## File Structure
- `src/runtimes/` — Runtime adapters (inference backends: Ollama)
- `src/harnesses/` — Harness adapters (direct, goose, opencode) + tool-prompt builder
- `src/tests/{test-name}/` — Benchmark tests (metadata, prompts, scoring specs, rubrics)
- `src/runner/` — Orchestration, plan building, item execution
- `src/lib/` — Scoring, code extraction, failure classification, utilities
- `src/schemas/` — Zod schemas (config, plan, result, scoring)
- `src/results/` — Result reading, writing, comparison
- `apps/dashboard/` — React dashboard for browsing results
- `results/` — Timestamped JSON runs (plan.json + run.json per run)

## Result Captures (per run)
- Model, harness, test name, pass type (blind/informed)
- Generated code (or codeFilePath for tool-calling)
- Automated score (passed/failed/total)
- Frontier eval (score, reasoning, model used)
- Duration, tokens generated
- Failure tracking (generationFailure, scoringFailure, frontierEvalFailure)

## Guardrails & Constraints
- Single-machine focus (M4 Pro Mac mini, 64GB) until expanded
- Harnesses must be swappable and comparable
- Results must include full metadata for reproducibility

## Success Criteria
- All 13 tests run end-to-end with tool-required computer-use tests limited to tool-calling harnesses
- Both blind and informed passes captured per model/harness/test
- Automated tests run and score correctly
- Frontier eval returns score + reasoning and is logged
- Dashboard displays runs with full scoring plus latest-checkpoint leaderboard views
- CLI compare reports cross-run deltas with checkpoint guardrails

## Dashboard

React-based visual dashboard at `apps/dashboard/` for browsing benchmark results, inspecting latest-checkpoint aggregates, and explaining benchmark semantics.

**Views:**
- **Leaderboard** - Latest-checkpoint aggregate with filters, charts, and machine-aware ranking
- **Run List** - Browse all runs with summary cards
- **Run Detail** - Matrix table, scoring breakdown, timing stats, failure/tooling analysis
- **About** - Explains benchmark mechanics, scoring, aggregation, and test catalog details

**Charts:**
- Composite score (effective score + pass rate + tool success + frontier)
- Blind vs informed comparison
- Pass rate by dimension (model/harness/test)
- Timing distribution histogram
- Frontier eval scatter plot

**Composite Score Formula:**
```
effectiveScore = passRate × 0.4 + completionRate × 0.3 + toolSuccessRate × 0.3
```

This weights models that complete all items and successfully use tools higher than models that only pass easy tests on simple harnesses.
