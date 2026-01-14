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

## What It Tests (Initial Scope)
- **Coding tasks** starting with a todo app using state management
- Expandable test catalog over time

## Scoring & Evaluation
- **Automated:** run test suite (vitest/jest) against generated code → pass/fail/total
- **Frontier eval:** send code + rubric to GPT-5.2 xhigh via OpenRouter → score 1–10 + reasoning

## Architecture & Stack (High Level)
- **Language:** TypeScript
- **Harnesses:** shell out to Ollama / Goose / OpenCode CLIs or call APIs directly
- **Results:** JSON files per run
- **Runner:** orchestrates generation + automated tests + frontier eval

## File Structure (Target)
- `src/harnesses/` — `ollama.ts`, `goose.ts`, `opencode.ts`
- `src/tests/{test-name}/` — prompts, blind/informed variants, spec tests, rubric
- `src/scorer.ts` — orchestration + OpenRouter call
- `results/` — timestamped JSON runs

## Result Captures (per run)
- Model, harness, test name, pass type (blind/informed)
- Generated code
- Automated score (passed/failed/total)
- Frontier eval (score, reasoning, model used)
- Duration, tokens generated
- **Local resource usage:** memory and energy usage during the run

## Guardrails & Constraints
- Single-machine focus (M4 Pro Mac mini, 64GB) until expanded
- Harnesses must be swappable and comparable
- Results must include full metadata for reproducibility

## Success Criteria
- One test (todo app) runs end-to-end across all harnesses
- Both blind and informed passes captured per model/harness/test
- Automated tests run and score correctly
- Frontier eval returns score + reasoning and is logged
