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
- **Success looks like**: A clear ranking/score breakdown per model/harness/test; easy reruns after tweaks.
- **Typical cadence**: Frequent reruns (same tests) after model, prompt, or harness changes.

### Persona B — Tooling Developer (Harness Evaluator)
- **Primary goal**: Validate harness correctness/reliability (Ollama/Goose/OpenCode) and catch regressions.
- **Success looks like**: Confidence that harness behavior is stable; diffs highlight where regressions arise.
- **Typical cadence**: Many small runs, focused on a single harness across models/tests.

### Persona C — Experimenter (Progress Tracker)
- **Primary goal**: Track progress over time and spot trends across runs (weekly/monthly baselines).
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

### State S2 — Catalog Browse (Tests / Harnesses / Models)
- **User sees**: Lists of available tests, harness adapters, and discoverable local models.
- **Artifacts**: Optional cached discovery output.
- **Decision points**:
  - Which test(s) to run?
  - Which harness(es) to run through?
  - Which model(s) to benchmark?

### State S3 — Run Plan (Matrix + Pass Types)
- **User sees**: A concrete execution plan before running:
  - All combinations of model × harness × test × pass type (blind/informed)
  - Estimated runtime and costs (if frontier eval is enabled)
- **Artifacts**:
  - A saved “run plan” metadata blob (recommended) for reproducibility.
- **Decision points**:
  - **Pass types**: blind only, informed only, or both (default: both).
  - **Scoring**: automated tests only vs automated + frontier-eval rubric.
  - **Reproducibility**: fixed seeds/timeouts vs “best effort”.
  - **Output mode**: quiet/verbose; progress format (human vs JSON lines). (MVP: non-interactive.)

### State S4 — Execution (Generate → Test → Evaluate → Record)
This is the core loop executed per matrix item.

- **User sees (per item)**:
  - “Generating code…” with streaming output (optional)
  - “Running automated tests…” with pass/fail summary
  - “Frontier eval…” with status (if enabled)
  - “Recording results…” with output path
- **Artifacts (per item)**:
  - Generated code snapshot (inline in JSON and/or separate file)
  - Automated test results (passed/failed/total + logs)
  - Frontier eval score + reasoning (if enabled)
  - Resource metrics (memory + energy usage)
- **Decision points**:
  - On generation failure: retry with sensible defaults, then mark item failed and continue.
  - On test failure: record failure and continue matrix.
  - On frontier eval failure (rate limit/network): record frontier-eval failure and continue.

### State S5 — Run Summary (Immediate Feedback)
- **User sees**:
  - A table summarizing results by model/harness/test/pass type
  - Pointers to detailed result files
  - A clear exit code policy (MVP: non-zero only on crashes)
- **Artifacts**:
  - Top-level run directory under `results/` (timestamped) containing a single run JSON.
- **Decision points**:
  - Is the user satisfied with the run, or do they need to drill into failures?

### State S6 — Drill-Down (Inspect a Single Result)
- **User sees**:
  - Generated code
  - Failing tests + logs
  - Frontier eval reasoning (if present)
  - Metadata (model, harness, durations, tokens, resource usage)
- **Artifacts**: None new (read-only), unless exporting subsets.
- **Decision points**:
  - If a regression is found: rerun with a narrower plan? pin versions? open an issue?

### State S7 — Compare / Analyze (Across Runs)
- **User sees**:
  - Diffs between two runs (score deltas, failure deltas, resource deltas)
  - Aggregations (best-of per model, stability across harnesses, etc.)
- **Artifacts**:
  - Exported reports (CSV/JSON) for notebooks, and/or a `reports/` directory.
- **Decision points**:
  - Which dimension is the “control” (model vs harness vs test vs pass type)?
  - Which metrics matter most (pass rate vs rubric vs energy/time)?

## Core Journey (Shared Happy Path)

This is the canonical “end-to-end” flow that all personas use, with different defaults.

1. **S0 → S1 (Start)**: user invokes CLI → config is resolved/loaded.
2. **S1 → S2 (Discover)**: user lists available tests/harnesses/models (or relies on defaults).
3. **S2 → S3 (Select)**: user selects tests, harnesses, models; chooses blind/informed pass strategy.
4. **S3 → S4 (Execute)**: runner iterates the full matrix; records JSON results for each item.
5. **S4 → S5 (Summarize)**: CLI prints the overall summary and points to `results/<run-id>/...`.
6. **S5 → S6 (Inspect)**: user opens a failing/interesting item for details.
7. **S6 → S7 (Compare)**: user compares against a baseline run (optional, but common).
8. **S7 → S3 (Iterate)**: user narrows/sweeps parameters and reruns.

## Persona-Specific Flows (With Decision Points)

### Persona A Flow — Local LLM Builder (Model Comparer)

- **Entry**: Typically begins at **S2** with a known test suite (“todo app”) and a set of candidate models.
- **Default decisions**:
  - **Run both passes** (blind + informed) to detect “prompt sensitivity”.
  - **Include frontier eval** to get a qualitative score even when tests are noisy.
- **Key decision points**:
  - If two models tie on tests, use frontier eval as tie-breaker.
  - If a model is slow/energy-heavy, decide whether to keep it in the candidate pool.
- **Typical transitions**:
  - **S2 → S3**: choose “all models” × “all harnesses” for one test.
  - **S4 → S6**: inspect failures to understand whether issues are model competence vs harness quirks.
  - **S7 → S3**: rerun a narrowed matrix after adjusting model parameters or prompts.

### Persona B Flow — Tooling Developer (Harness Evaluator)

- **Entry**: Often starts at **S1/S2** with a target harness and a small model set.
- **Default decisions**:
  - **Prefer automated tests** first (fast feedback).
  - **Run a minimal matrix** to isolate harness behavior (one test, one pass type).
- **Key decision points**:
  - If failures cluster on one harness across models, treat as harness regression.
  - If failures are model-specific on one harness, check adapter prompt formatting / tool wiring.
- **Typical transitions**:
  - **S3 → S4**: run only the suspected harness across a controlled baseline model.
  - **S4 → S6**: drill into logs and generated code to identify adapter-level issues.
  - **S6 → S3**: change one variable (harness version, flags, prompt template) and rerun.

### Persona C Flow — Experimenter (Progress Tracker)

- **Entry**: Begins at **S1** with standardized configs and a stored baseline run to compare against.
- **Default decisions**:
  - **Fixed run plans** (same tests/harnesses/models each time).
  - Frontier eval optional; enable only if costs are acceptable and the rubric is stable.
- **Key decision points**:
  - If results drift, decide whether drift is “real improvement” vs “harness/test instability”.
  - If format changes are needed, decide on migration strategy for old result JSON.
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
  - Disable frontier eval for this run, or retry later, or provide credentials.
- **Transition**:
  - S3 continues with automated tests only; result metadata records “frontier eval disabled/failed”.

### Partial Run Failure (S4 → S5 with Warnings)
- **Symptoms**: some matrix items fail due to timeouts, flaky tests, transient tool errors.
- **User decisions**:
  - Rerun only failed items vs rerun everything vs accept partial data.
- **Transition**:
  - S5 summary flags incomplete items; S6 allows drill-down on failures.

## Result Artifacts (What Users Expect to Find)

- **Per run (directory under `results/`)**:
  - Run metadata: timestamp, git revision (if available), host info, config snapshot
  - A single `run.json` containing:
    - A run-level summary (counts, aggregates)
    - A list of all matrix items (each with full details)

## MVP Defaults (Resolved)

- **Command model**: single primary command (no multi-step interactive wizard).
- **Interactivity**: non-interactive by default; no “confirm plan” prompt in MVP.
- **Discovery**: models/harnesses are auto-discovered by default.
- **Run plan persistence**: save an explicit plan artifact per run for reproducibility.
- **Results format**: one JSON per run (structured for easy aggregation/analysis).
- **Exit codes**: non-zero only on crashes (failed tests/items are recorded but do not fail the process).
- **Failure handling**:
  - Generation errors: retry (bounded), then mark item failed and continue.
  - Automated test failures: record and continue.
  - Frontier eval failures: record and continue.
- **Frontier eval**: enabled by default when OpenRouter API key is present.
- **Resource metrics**: best-effort capture in MVP (do not fail runs if unavailable).
- **Compare**: include a first-class compare flow/command in MVP.
- **Baseline naming**: not included for now.

## Remaining Questions (Nice-to-Have, Can Defer)

- **Config format**: JSON vs YAML vs TS (and exact file name/location).
- **Comparison UX**: how users specify two runs to compare (run IDs, paths, “latest”, etc.).
- **Reproducibility metadata**: which versions are mandatory (harness CLI versions, model runtime versions, OS info).

