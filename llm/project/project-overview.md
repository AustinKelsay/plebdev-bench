# Project Overview

## Snapshot
- **Project:** plebdev-bench — local LLM benchmark runner
- **Type:** CLI-driven test harness + scoring pipeline
- **Scope:** Local models on M4 Pro Mac mini (64GB) only (for now)
- **Modeling:** Blind vs informed **Pass Types** for each **Benchmark Test**

## Mission & Outcomes
Build a simple, repeatable way to benchmark local LLMs across multiple **Harnesses** and **Benchmark Categories**. Success means consistent **Benchmark Runs**, comparable scores, and clean, inspectable **Run Results** for every Runtime Model/Harness/Benchmark Test/Pass Type combination.

## Core Objectives
- Test every **Runtime Model** against every compatible **Harness** for each **Benchmark Test**
- Support **Benchmark Category** selection (`coding`, `computer-use`)
- Run two **Pass Types** per Benchmark Test: **blind** (no hints) and **informed** (test name/definition)
- Score with both **Automated Score** suites and optional **Frontier Eval** rubric evidence
- Store **Run Results** in a stable, machine-readable format for analysis

## Audience
- **Local LLM builders** comparing models on real tasks
- **Tooling developers** evaluating harness quality and reliability
- **Experimenters** tracking progress over time

## What It Tests
- **13 Benchmark Tests:**
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

## Benchmark Categories
- `coding` — implementation-focused developer tasks (current catalog default)
- `computer-use` — bounded machine/sandbox orchestration tasks

## Scoring & Evaluation
- **Automated Score:** either import generated code and run scoring-spec test cases, or compare a seeded workspace against exact filesystem assertions → pass/fail/total
- **Frontier Eval:** send code + rubric to GPT-5.4 via OpenRouter for code-module Benchmark Tests → score 1–10 + reasoning

## Architecture & Stack (High Level)
- **Language:** TypeScript
- **Runtimes:** inference backends that expose Runtime Models (currently Ollama only for active execution)
- **Harnesses:** adapters (direct, goose, opencode) that ask Runtime Models to perform Benchmark Tests
- **Results:** Run Plan and Run Result JSON files per Benchmark Run
- **Runner:** orchestrates generation + Automated Score + Frontier Eval

## File Structure
- `src/runtimes/` — Runtime adapters (inference backends: Ollama)
- `src/harnesses/` — Harness adapters (direct, goose, opencode) + tool-prompt builder
- `src/tests/{test-name}/` — Benchmark Tests (metadata, prompts, scoring specs, rubrics)
- `src/runner/` — Orchestration, plan building, item execution
- `src/lib/` — Scoring, code extraction, failure classification, utilities
- `src/schemas/` — Zod schemas (config, plan, result, scoring)
- `src/results/` — Run Result reading, writing, Run Comparison
- `apps/dashboard/` — React dashboard for browsing results
- `results/` — Timestamped JSON runs (plan.json + run.json per run)

## Result Captures (per Benchmark Run)
- Runtime Model, Harness, Benchmark Test, Pass Type (blind/informed)
- Generated code (or codeFilePath for tool-calling)
- Automated Score (passed/failed/total)
- Frontier Eval (score, reasoning, model used)
- Duration, tokens generated
- Failure tracking (generationFailure, scoringFailure, frontierEvalFailure)

## Guardrails & Constraints
- Single-machine focus (M4 Pro Mac mini, 64GB) until expanded
- Harnesses must be swappable and comparable without blurring Runtime behavior
- Run Results must include full metadata for reproducibility

## Success Criteria
- All 13 tests run end-to-end with tool-required computer-use tests limited to tool-calling harnesses
- Both blind and informed Pass Types captured per Runtime Model/Harness/Benchmark Test
- Automated Score runs correctly
- Frontier Eval returns score + reasoning and is logged when enabled
- Dashboard displays Benchmark Runs with full scoring plus latest-Benchmark-Checkpoint leaderboard views
- CLI Run Comparison reports cross-run deltas with Benchmark Checkpoint guardrails

## Dashboard

React-based visual dashboard at `apps/dashboard/` for browsing Run Results, inspecting latest-Benchmark-Checkpoint aggregates, and explaining benchmark semantics.

**Views:**
- **Leaderboard** - Latest-Benchmark-Checkpoint aggregate with filters, charts, and Machine Profile-aware ranking
- **Run List** - Browse all Benchmark Runs with summary cards
- **Run Detail** - Matrix table, scoring breakdown, timing stats, failure/tooling analysis
- **About** - Explains benchmark mechanics, scoring, aggregation, and test catalog details

**Charts:**
- Composite score (effective score + pass rate + tool success) with Frontier Eval shown as separate qualitative evidence
- Blind vs informed comparison
- Pass rate by dimension (model/harness/test)
- Timing distribution histogram
- Frontier eval scatter plot

**Composite Score Formula:**
```
effectiveScore = passRate × 0.4 + completionRate × 0.3 + toolSuccessRate × 0.3
```

This weights models that complete all items and successfully use tools higher than models that only pass easy tests on simple harnesses.
