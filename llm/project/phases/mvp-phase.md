Purpose: MVP phase plan for `plebdev-bench` (core benchmark value delivered end-to-end).

# MVP Phase

Ship the smallest version that delivers the core value: repeatable benchmarking across a matrix (blind + informed), automated scoring, optional OpenRouter eval, and run comparison.

## Goals
- Deliver the primary flows from `llm/project/user-flow.md`: run → inspect → compare.
- Support a real matrix: **model × harness × test × passType** (blind + informed).
- Establish meaningful quality gates: deterministic tests and schema validation.

## Scope
- In scope:
  - Multi-item run plan expansion (models/harnesses/tests/passTypes)
  - Benchmark test catalog: todo-app, calculator-basic, calculator-stateful
  - Automated scoring via Vitest (real scoring tests per benchmark)
  - Optional frontier eval via OpenRouter `fetch` (auto-enabled with API key)
  - Built-in compare (two `run.json` inputs → deterministic deltas)
  - Structured per-item failures without aborting the run
- Out of scope:
  - Interactive TUI, heavy visualization, distributed execution, database storage

## Steps (per feature)

### Feature A — Full run orchestration (matrix + durability)
1. Implement plan expansion:
   - auto-discover models (Ollama)
   - enumerate harnesses/tests/passTypes
   - produce a stable `RunPlan` and write `plan.json`
2. Execute the full plan with deterministic progress output (`item 07/48`).
3. Write one `run.json` containing:
   - run-level summary
   - all item results (success + failure shapes)

### Feature B — Benchmark test catalog (real scoring)
1. Implement the benchmark test catalog with three tests:

   **Test 1: todo-app**
   - State management for tasks (add, toggle, delete)
   - blind/informed prompts
   - acceptance criteria in `README.md`
   - `scoring.test.ts` validates CRUD operations

   **Test 2: calculator-basic**
   - Stateless arithmetic: `+`, `-`, `*`, `/`
   - Blind prompt: "Build a calculator"
   - Informed prompt: includes function signature hints
   - `scoring.test.ts` validates:
     - Basic operations work correctly
     - Division by zero handling
     - Floating point edge cases

   **Test 3: calculator-stateful**
   - Running total with operation chaining
   - Memory functions (MC, MR, M+, M-)
   - Blind prompt: "Build a calculator with memory"
   - Informed prompt: includes state shape hints
   - `scoring.test.ts` validates:
     - Operation chaining works
     - Memory functions work
     - Clear/reset behavior

2. Define a stable harness contract for "generated code artifact" so scoring can run consistently.
3. Make scoring deterministic and offline (no network).

### Feature C — OpenRouter frontier eval (optional, non-blocking)
1. Add an OpenRouter client using `fetch` with:
   - timeout + bounded retries
   - consistent error object
2. Auto-enable eval when API key is present; if missing/failing, record and continue.
3. Store eval inputs/outputs in `run.json` with redaction safeguards (no secrets).

### Feature D — Compare (first-class, deterministic)
1. Implement `bench compare <run-a> <run-b>` that:
   - reads/validates both `run.json` files
   - computes deltas by model/harness/test/passType
2. Print a terminal-native diff table with explicit `Δ` fields and labels.
3. Add tests to guarantee compare determinism (same inputs → same output).

### Feature E — Hardening the non-interactive contract
1. Ensure all network/process IO is bounded (timeouts everywhere).
2. Ensure per-item failures never crash the whole run (unless programmer/config error).
3. Confirm exit codes: non-zero only on crashes.

## Exit Criteria
- `bench run` executes a multi-item matrix (both passTypes) and writes `plan.json` + one `run.json`.
- At least three benchmark tests (todo-app, calculator-basic, calculator-stateful) have real scoring tests and produce meaningful pass/fail counts.
- Frontier eval works via OpenRouter when keyed and records results; failures are recorded and do not crash the run.
- `bench compare` works and outputs deterministic deltas.
- Docs and runbooks match the shipped MVP behavior.

## Suggested Agent Prompt
```
Update @llm/project/phases/mvp-phase.md with project-specific steps.
Keep scope focused on the core value and list 3-5 actionable steps per feature.
```
