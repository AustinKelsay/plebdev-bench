<!--
Purpose: Describe the end-to-end user journey for `plebdev-bench` as a set of CLI "screens" (states),
including state transitions and decision points, mapped across the project’s core personas.

This is intentionally CLI-first (per project overview). If a UI is added later, each "screen" here
maps cleanly to a UI view + state machine.
-->

# User Flow

## Personas

### Persona A — Local LLM Builder (Model Comparer)
- **Primary goal**: Compare local models on real tasks with repeatable runs and comparable scores.
- **Success looks like**: A clear ranking/score breakdown per Runtime Model/Harness/Benchmark Test; easy reruns after tweaks.
- **Typical cadence**: Frequent reruns (same tests) after model, prompt, or harness changes.

### Persona B — Tooling Developer (Harness Evaluator)
- **Primary goal**: Validate harness correctness/reliability (Ollama/Goose/OpenCode) and catch regressions.
- **Success looks like**: Confidence that harness behavior is stable; diffs highlight where regressions arise.
- **Typical cadence**: Many small runs, focused on a single harness across models/tests.

### Persona C — Experimenter (Progress Tracker)
- **Primary goal**: Track progress over time and spot trends across Benchmark Runs (weekly/monthly baselines).
- **Success looks like**: Longitudinal comparisons and stable result formats for downstream analysis.
- **Typical cadence**: Scheduled runs; standardized config; automated export to charts/notebooks later.

## Shared “Screens” (CLI States)

The product is CLI-driven, so “screens” are states a user experiences via commands, interactive prompts,
progress output, and generated artifacts on disk.

### State S0 — Bootstrap / First Run Readiness
- **User sees**: A quickstart and/or `--help` output describing required dependencies and how to configure.
- **Artifacts**: None yet.
- **Transition triggers**:
  - User runs the primary command (single-command UX) or `--help`.
- **Decision points**:
  - Is this a first-time setup? If yes, user needs a config + dependency verification.

### State S1 — Configuration Loaded
- **User sees**: Confirmation of config source (defaults vs config file vs CLI flags).
- **Artifacts**:
  - A config file on disk (recommended) and/or a resolved “effective config” printed in verbose mode.
- **Decision points**:
  - Should OpenRouter frontier-eval be enabled (auto-enabled when API key is present)?

### State S2 — Catalog Browse (Benchmark Tests / Fixed Runtime / Harnesses / Runtime Models)
- **User sees**: Lists of available Benchmark Tests, the active Runtime (`ollama`), Harness adapters, and discoverable local Runtime Models.
- **Artifacts**: Optional cached discovery output.
- **Note**: Runtime is fixed to `ollama` for the MVP.
- **Decision points**:
  - Select Benchmark Test(s) to run.
  - Choose Benchmark Category/categories (`coding`, `computer-use`).
  - Pick Harness(es) to execute.
  - Select Runtime Model(s) to benchmark.

### State S3 — Run Plan (Matrix + Pass Types)
- **User sees**: A concrete execution plan before running:
  - All combinations of the fixed `ollama` Runtime × Harness × Runtime Model × Benchmark Test × Pass Type (blind/informed)
  - Estimated runtime and costs (if Frontier Eval is enabled)
- **Artifacts**:
  - A saved **Run Plan** metadata blob for reproducibility.
- **Decision points**:
  - **Pass Types**: blind only, informed only, or both (default: both).
  - **Scoring**: Automated Score only vs Automated Score + Frontier Eval rubric.
  - **Reproducibility**: fixed seeds/timeouts vs “best effort”.
  - **Output mode**: quiet/verbose; progress format (human vs JSON lines). (MVP: non-interactive.)

### State S4 — Execution (Generate → Test → Evaluate → Record)
This is the core loop executed per **Matrix Item**.

- **User sees (per item)**:
  - “Generating code…” with streaming output (optional)
  - “Running Automated Score…” with pass/fail summary
  - “Frontier Eval…” with status (if enabled)
  - “Recording results…” with output path
- **Artifacts (per item)**:
  - Generated code snapshot (inline in JSON and/or separate file)
  - Automated Score results (passed/failed/total + logs)
  - Frontier Eval score + reasoning (if enabled)
  - Timing, token counts, and failure metadata when available
- **Decision points**:
  - On Generation Failure: retry with sensible defaults, then mark the Matrix Item failed and continue.
  - On Scoring Failure: record failure and continue Matrix execution.
  - On Frontier Eval Failure (rate limit/network): record failure and continue.

### State S5 — Run Summary (Immediate Feedback)
- **User sees**:
  - A table summarizing results by Runtime Model/Harness/Benchmark Test/Pass Type
  - Pointers to detailed result files
  - A clear exit code policy (MVP: non-zero only on crashes)
- **Artifacts**:
  - Top-level run directory under `results/` (timestamped) containing a single **Run Result**.
- **Decision points**:
  - Is the user satisfied with the run, or do they need to drill into failures?

### State S6 — Drill-Down (Inspect a Single Result)
- **User sees**:
  - Generated code
  - Failing tests + logs
  - Frontier Eval reasoning (if present)
  - Metadata (Runtime Model, Harness, durations, tokens, Benchmark Checkpoint, Machine Profile, Machine Instance)
- **Artifacts**: None new (read-only), unless exporting subsets.
- **Decision points**:
  - If a regression is found: rerun with a narrower plan? pin versions? open an issue?

### State S7 — Run Comparison / Analyze (Across Runs)
- **User sees**:
  - Diffs between two compatible Run Results (score deltas, failure deltas, duration deltas)
  - Aggregations (best-of per Model Profile, stability across Harnesses, etc.)
- **Artifacts**:
  - Terminal diff output and optional raw JSON from the Run Comparison command.
- **Decision points**:
  - Which dimension is the “control” (Model Profile vs Harness vs Benchmark Test vs Pass Type)?
  - Which metrics matter most (pass rate vs Frontier Eval vs duration)?

## Core Journey (Shared Happy Path)

This is the canonical “end-to-end” flow that all personas use, with different defaults.

1. **S0 → S1 (Start)**: user invokes CLI → config is resolved/loaded.
2. **S1 → S2 (Discover)**: user lists available Benchmark Tests/Harnesses/Runtime Models (or relies on defaults).
3. **S2 → S3 (Select)**: user selects Benchmark Tests, Harnesses, Runtime Models; chooses blind/informed Pass Type strategy.
4. **S3 → S4 (Execute)**: runner iterates the full Matrix; records JSON results for each Matrix Item.
5. **S4 → S5 (Summarize)**: CLI prints the overall summary and points to `results/<run-id>/...`.
6. **S5 → S6 (Inspect)**: user opens a failing/interesting item for details.
7. **S6 → S7 (Run Comparison)**: user compares against a baseline Benchmark Run (optional, but common).
8. **S7 → S3 (Iterate)**: user narrows/sweeps parameters and reruns.

## Persona-Specific Flows (With Decision Points)

### Persona A Flow — Local LLM Builder (Model Comparer)

- **Entry**: Typically begins at **S2** with a known test suite (“todo app”) and a set of candidate models.
- **Default decisions**:
  - **Run both Pass Types** (blind + informed) to detect prompt-context sensitivity.
  - **Include Frontier Eval** to get qualitative evidence when Automated Score is noisy.
- **Key decision points**:
  - If two Model Profiles tie on Automated Score, use Frontier Eval as supporting evidence.
  - If a model is much slower on the same matrix, decide whether the quality gain is worth it.
- **Typical transitions**:
  - **S2 → S3**: choose “all Runtime Models” × “all Harnesses” for one Benchmark Test.
  - **S4 → S6**: inspect failures to understand whether issues are Runtime Model competence vs Harness quirks.
  - **S7 → S3**: rerun a narrowed matrix after adjusting model parameters or prompts.

### Persona B Flow — Tooling Developer (Harness Evaluator)

- **Entry**: Often starts at **S1/S2** with a target harness and a small model set.
- **Default decisions**:
  - **Prefer automated tests** first (fast feedback).
  - **Run a minimal Matrix** to isolate Harness behavior (one Benchmark Test, one Pass Type).
- **Key decision points**:
  - If failures cluster on one Harness across Runtime Models, treat as Harness regression.
  - If failures are Runtime Model-specific on one Harness, check adapter prompt formatting / tool wiring.
- **Typical transitions**:
  - **S3 → S4**: run only the suspected Harness across a controlled baseline Runtime Model.
  - **S4 → S6**: drill into logs and generated code to identify adapter-level issues.
  - **S6 → S3**: change one variable (harness version, flags, prompt template) and rerun.

### Persona C Flow — Experimenter (Progress Tracker)

- **Entry**: Begins at **S1** with standardized configs and a stored baseline run to compare against.
- **Default decisions**:
  - **Fixed run plans** (same tests/harnesses/models each time).
  - Frontier Eval optional; enable only if costs are acceptable and the rubric is stable.
- **Key decision points**:
  - If Run Results drift, decide whether drift is “real improvement” vs “Harness/Benchmark Test instability”.
  - If format changes are needed, decide on migration strategy for old Run Results.
- **Typical transitions**:
  - **S1 → S3**: load a saved plan or “standard suite” preset.
  - **S5 → S7**: compare against last week/month baseline.
  - **S7 → (external)**: export to analysis tooling (CSV/JSON) for charting.

## Error / Recovery Flows (Common Branches)

### Missing Dependencies / Harness Not Available (S0/S1 → Blocked)
- **Symptoms**: harness executable not found, model runtime not running, permission errors.
- **User decisions**:
  - Install/fix dependency now vs switch to another harness vs stop.
- **Transition**:
  - Blocked → S0 until dependencies validate; then proceed to S1.

### Frontier Eval Not Configured (S1/S3 → Degraded)
- **Symptoms**: missing OpenRouter API key, request failure, rate limiting.
- **User decisions**:
  - Disable Frontier Eval for this Benchmark Run, or retry later, or provide credentials.
- **Transition**:
  - S3 continues with Automated Score only; result metadata records “Frontier Eval disabled/failed”.

### Partial Run Failure (S4 → S5 with Warnings)
- **Symptoms**: some matrix items fail due to timeouts, flaky tests, transient tool errors.
- **User decisions**:
  - Rerun only failed items vs rerun everything vs accept partial data.
- **Transition**:
  - S5 summary flags incomplete items; S6 allows drill-down on failures.

## Result Artifacts (What Users Expect to Find)

- **Per Benchmark Run (directory under `results/`)**:
  - `plan.json` with Benchmark Checkpoint, Machine Profile, Machine Instance, config snapshot, and full Run Plan
  - `run.json` with a run-level summary and all Matrix Items
  - `run.partial.json` as a Partial Run Result during long runs until final write succeeds

## MVP Defaults (Resolved)

- **Command model**: single primary command (no multi-step interactive wizard).
- **Interactivity**: non-interactive by default; no “confirm plan” prompt in MVP.
- **Discovery**: models/harnesses are auto-discovered by default; runtime is fixed to `ollama` for the MVP.
- **Run Plan persistence**: save an explicit plan artifact per Benchmark Run for reproducibility.
- **Run Result format**: one JSON per Benchmark Run (structured for easy aggregation/analysis).
- **Exit codes**: non-zero only on crashes (failed Benchmark Tests/Matrix Items are recorded but do not fail the process).
- **Failure handling**:
  - Generation errors: retry (bounded), then mark item failed and continue.
  - Automated test failures: record and continue.
  - Frontier Eval failures: record and continue.
- **Frontier Eval**: enabled by default when OpenRouter API key is present.
- **Resource metrics**: best-effort capture in MVP (do not fail runs if unavailable).
- **Run Comparison**: include a first-class compare flow/command in MVP.
- **Baseline naming**: not included for now.

## Remaining Questions (Nice-to-Have, Can Defer)

- **Config format**: JSON vs YAML vs TS (and exact file name/location).
- **Comparison UX**: how users specify two runs to compare (run IDs, paths, “latest”, etc.).
- **Reproducibility metadata**: which versions are mandatory (harness CLI versions, model runtime versions, OS info).
