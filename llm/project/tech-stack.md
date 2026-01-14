Purpose: Define the chosen, minimal, local-first tech stack for `plebdev-bench` (TypeScript CLI benchmark runner) and how we use it.

# Tech Stack

This project is a **CLI-driven local benchmark runner** (single command, non-interactive), orchestrating:
- Harness calls (Ollama / Goose / OpenCode via CLI or API)
- Two-pass runs (blind + informed)
- Automated test scoring
- Optional frontier-eval via **OpenRouter** (auto-enabled when API key is present)
- Stable results stored as **one `run.json` per run**
- Best-effort local resource metrics (memory + energy) on macOS

## Design Goals (Stack Drivers)
- **Simple MVP**: minimal dependencies, boring defaults, easy to run locally.
- **Reproducible runs**: explicit run plan artifact + stable JSON schema.
- **Swappable harnesses**: adapters should be isolated behind interfaces.
- **Fast feedback**: quick iteration on tests and harness integrations.

## Chosen Stack (MVP)

- **Bun + TypeScript**
- **bun** (package manager)
- **commander** for CLI
- **zod** for config/results schema
- **execa** for calling harness CLIs and test runners
- **vitest** for harness/test-infra tests
- **pino** for logs
- OpenRouter via **direct `fetch`** (auto-enabled when API key present)
- Results written to `results/<run-id>/run.json` + `results/<run-id>/plan.json`
- `compare` implemented as a built-in CLI path that reads two run files and prints deltas

## Best Practices, Pitfalls, and Usage Conventions

This section captures “how we use the stack” so the codebase stays consistent and easy to extend.

### Bun (runtime + package manager)
- **Best practices**:
  - Prefer Bun’s native `fetch` for HTTP and keep HTTP helpers small and typed.
  - Use `bun` scripts as the single entrypoint for dev/test/build to avoid split-brain tooling.
  - Keep the runtime surface area small; isolate any Node-compat edge cases behind adapters.
- **Common pitfalls**:
  - Some Node ecosystem packages assume Node-specific behaviors; prefer minimal dependencies.
  - Path/ESM/CJS interop can get weird when mixing tools; keep output format consistent.
- **Conventions**:
  - Treat Bun as the default runtime; keep Node as a documented fallback only.

### TypeScript
- **Best practices**:
  - Model core domain objects explicitly (RunPlan, MatrixItem, RunResult) and keep them stable.
  - Use `unknown` at boundaries (CLI args, file IO, network) and validate/parse immediately.
  - Favor small pure functions and data-first transforms for aggregation/compare.
- **Common pitfalls**:
  - Letting “any” creep in at boundaries; it will poison result aggregation quickly.
  - Over-engineering types early; start with stable schemas and iterate.
- **Conventions**:
  - All public functions should have doc comments describing purpose and parameters.
  - Prefer functional modules over classes; keep files small and composable.

### Zod (schema validation)
- **Best practices**:
  - Treat Zod schemas as the **source of truth** for config and `run.json` structure.
  - Use `safeParse` at runtime boundaries and convert failures into structured errors.
  - Version result schemas early (e.g., `schemaVersion`) to enable future migrations.
- **Common pitfalls**:
  - Using inferred TS types without validating runtime inputs (files/network are always untrusted).
  - Silent coercion; only coerce when explicitly intended and documented.
- **Conventions**:
  - Keep schemas in a dedicated module and export both the schema and inferred TS type.
  - Do not mutate parsed objects; treat them as immutable inputs to the pipeline.

### `fetch` (OpenRouter + Ollama HTTP)
- **Best practices**:
  - Centralize HTTP calls in a tiny client module per provider (OpenRouter, Ollama).
  - Enforce: timeouts, retries (bounded), and consistent error objects.
  - Record request metadata needed for reproducibility (model name, endpoint, latency), but never log secrets.
- **Common pitfalls**:
  - No timeout ⇒ hung runs. Always set an abort timeout for every request.
  - Treating non-2xx as “success” and failing later; handle HTTP status explicitly.
  - Streaming complexity: start non-streaming for MVP unless streaming is required.
- **Conventions**:
  - OpenRouter is auto-enabled when an API key is present; failures must not crash the whole run.
  - Ollama is local-only; connection failures should mark items failed and continue.

### Execa (process execution)
- **Best practices**:
  - Use explicit timeouts and capture both stdout/stderr for diagnostics.
  - Prefer passing args as arrays (avoid shell quoting issues).
  - Make process execution deterministic: fixed env, fixed cwd, explicit PATH if needed.
- **Common pitfalls**:
  - Buffering huge outputs in memory; stream when outputs can be large.
  - Missing signal handling/cleanup on abort; ensure child processes are terminated.
- **Conventions**:
  - All harness invocations go through a single “exec” helper so logging/timeout behavior is consistent.

### Vitest (tests + scoring harness)
- **Best practices**:
  - Keep “bench runner tests” separate from “generated-code scoring tests”.
  - Make tests deterministic; avoid network and time-based flakiness.
  - Prefer snapshot tests for stable textual outputs (compare output, schemas), not for large generated code blobs.
- **Common pitfalls**:
  - Flaky tests turn benchmark results into noise; treat flakes as failures and fix promptly.
  - Over-coupling tests to exact logs; assert on structured output instead.
- **Conventions**:
  - Every test should write results to temp directories and clean up after itself.

### Pino (logging)
- **Best practices**:
  - Use structured fields (runId, model, harness, testName, passType) for every log line.
  - Use log levels intentionally: `info` for milestones, `debug` for per-item detail, `error` for failures.
  - Keep human output concise; store full details in `run.json`.
- **Common pitfalls**:
  - Logging secrets (OpenRouter keys) or raw request bodies; never do this.
  - Logging too much by default; it makes CLI UX noisy and slows runs.
- **Conventions**:
  - Default output is human-readable; support JSON logs as an opt-in mode.

### Results + Reproducibility (files)
- **Best practices**:
  - Write **one `run.json` per run** with a stable schema and a summary section for quick comparisons.
  - Always write a `plan.json` (resolved config + matrix expansion) alongside `run.json`.
  - Include environment metadata (OS, Bun version, harness versions when possible).
- **Common pitfalls**:
  - Mixing per-item JSON files and run JSON early; stick to one format in MVP.
  - Letting results grow unbounded; prefer references/paths for very large blobs if needed later.
- **Conventions**:
  - Exit code is non-zero **only on crashes**; failures are recorded in results.
  - Compare operates on `run.json` inputs and outputs deltas deterministically.

## Open Decisions (Small, MVP-Safe)
- **Config file name**: `bench.config.json` vs `plebdev-bench.config.json`
- **Compare UX**: compare by run ID (search under `results/`) vs explicit file paths
- **Result schema versioning**: add `schemaVersion` early to avoid future migrations

