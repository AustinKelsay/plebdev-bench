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
- Run two passes per test: **blind** (no hints) and **informed** (test name/definition)
- Score with both automated test suites and a frontier-eval rubric
- Store results in a stable, machine-readable format for analysis

## Audience
- **Local LLM builders** comparing models on real tasks
- **Tooling developers** evaluating harness quality and reliability
- **Experimenters** tracking progress over time

## What It Tests
- **8 benchmark tests:**
  - `smoke` - Basic add() function (simplest possible test)
  - `calculator-basic` - Stateless arithmetic functions
  - `calculator-stateful` - Calculator with memory operations
  - `todo-app` - CRUD todo manager with state management
  - `tool-smoke` - Tool-calling preflight test for Goose/OpenCode
  - `rate-limiter` - Stateful per-key fixed-window rate limiting
  - `ttl-cache` - Deterministic in-memory TTL cache behavior
  - `event-emitter` - Listener lifecycle and event isolation semantics
- Expandable test catalog over time

## Scoring & Evaluation
- **Automated:** run test suite (vitest/jest) against generated code → pass/fail/total
- **Frontier eval:** send code + rubric to GPT-5.2 xhigh via OpenRouter → score 1–10 + reasoning

## Architecture & Stack (High Level)
- **Language:** TypeScript
- **Runtimes:** inference backends (e.g., Ollama, vLLM)
- **Harnesses:** adapters (direct, goose, opencode) that call CLIs/APIs
- **Results:** JSON files per run
- **Runner:** orchestrates generation + automated tests + frontier eval

## File Structure
- `src/runtimes/` — Runtime adapters (inference backends: Ollama, vLLM)
- `src/harnesses/` — Harness adapters (direct, goose, opencode) + tool-prompt builder
- `src/tests/{test-name}/` — Benchmark tests (prompts, scoring specs, rubrics)
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
- All 8 tests run end-to-end across all harnesses
- Both blind and informed passes captured per model/harness/test
- Automated tests run and score correctly
- Frontier eval returns score + reasoning and is logged
- Dashboard displays runs with full scoring and comparison

## Dashboard

React-based visual dashboard at `apps/dashboard/` for browsing and comparing benchmark results.

**Views:**
- **Run List** - Browse all runs with summary cards
- **Run Detail** - Matrix table, scoring breakdown, timing stats, failure/tooling analysis
- **Compare** - Side-by-side diff with deltas

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
