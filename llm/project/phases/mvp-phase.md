Purpose: MVP phase plan for `plebdev-bench` (core benchmark value delivered end-to-end).

# MVP Phase

Ship the smallest version that delivers the core value: repeatable benchmarking across a Matrix (blind + informed Pass Types), Automated Score, optional OpenRouter Frontier Eval, and Run Comparison.

## Goals
- Deliver the primary flows from `llm/project/user-flow.md`: Benchmark Run → inspect → Run Comparison.
- Support a real Matrix: **Runtime × Harness × Runtime Model × Benchmark Test × Pass Type** (blind + informed).
- Establish meaningful quality gates: deterministic tests and schema validation.

## Scope
- In scope:
  - Multi-item Run Plan expansion (Runtime Models/Harnesses/Benchmark Tests/Pass Types)
  - Benchmark Test catalog: todo-app, calculator-basic, calculator-stateful
  - Automated Score via Vitest (real scoring tests per Benchmark Test)
  - Optional Frontier Eval via OpenRouter `fetch` (auto-enabled with API key)
  - Built-in Run Comparison (two `run.json` inputs → deterministic deltas)
  - Structured per-Matrix-Item failures without aborting the Benchmark Run
- Out of scope:
  - Interactive TUI, heavy visualization, distributed execution, database storage

## Steps (per feature)

### Feature A — Full Benchmark Run orchestration (Matrix + durability)
1. Implement plan expansion:
   - auto-discover Runtimes (Ollama)
   - auto-discover Runtime Models from Runtimes
   - enumerate Harnesses/Benchmark Tests/Pass Types
   - produce a stable `RunPlan` and write `plan.json`
2. Execute the full plan with deterministic progress output (`item 07/48`).
3. Write one `run.json` containing:
   - run-level summary
   - all Matrix Item results (success + failure shapes)

### Feature B — Benchmark Test catalog (real scoring)
1. Implement the Benchmark Test catalog with three tests:

   **Test 1: todo-app**
   - State management for tasks (add, toggle, delete)
   - blind/informed prompts
   - acceptance criteria in `README.md`
   - `scoring.spec.ts` defines CRUD scoring expectations

   **Test 2: calculator-basic**
   - Stateless arithmetic: `+`, `-`, `*`, `/`
   - Blind prompt: "Build a calculator"
   - Informed prompt: includes function signature hints
   - `scoring.spec.ts` validates:
     - Basic operations work correctly
     - Division by zero handling
     - Floating point edge cases

   **Test 3: calculator-stateful**
   - Running total with operation chaining
   - Memory functions (MC, MR, M+, M-)
   - Blind prompt: "Build a calculator with memory"
   - Informed prompt: includes state shape hints
   - `scoring.spec.ts` validates:
     - Operation chaining works
     - Memory functions work
     - Clear/reset behavior

2. Define a stable harness contract for "generated code artifact" so scoring can run consistently.
3. Make scoring deterministic and offline (no network).

### Feature C — OpenRouter Frontier Eval (optional, non-blocking)
1. Add an OpenRouter client using `fetch` with:
   - timeout + bounded retries
   - consistent error object
2. Auto-enable Frontier Eval when API key is present; if missing/failing, record and continue.
3. Store Frontier Eval inputs/outputs in `run.json` with redaction safeguards (no secrets).

### Feature D — Run Comparison (first-class, deterministic)
1. Implement `bench compare <run-a> <run-b>` that:
   - reads/validates both `run.json` files
   - computes deltas by Runtime Model/Harness/Benchmark Test/Pass Type
2. Print a terminal-native diff table with explicit `Δ` fields and labels.
3. Add tests to guarantee compare determinism (same inputs → same output).

### Feature E — Hardening the non-interactive contract
1. Ensure all network/process IO is bounded (timeouts everywhere).
2. Ensure per-Matrix-Item failures never crash the whole Benchmark Run (unless programmer/config error).
3. Confirm exit codes: non-zero only on crashes.

## Exit Criteria
- `bench run` executes a multi-item Matrix (both Pass Types) and writes `plan.json` + one `run.json`.
- At least three Benchmark Tests (todo-app, calculator-basic, calculator-stateful) have real scoring tests and produce meaningful pass/fail counts.
- Frontier Eval works via OpenRouter when keyed and records results; failures are recorded and do not crash the Benchmark Run.
- `bench compare` works and outputs deterministic Run Comparison deltas.
- Docs and runbooks match the shipped MVP behavior.

## Suggested Agent Prompt
```
Update @llm/project/phases/mvp-phase.md with project-specific steps.
Keep scope focused on the core value and list 3-5 actionable steps per feature.
```
