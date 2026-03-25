Purpose: Document the completed multi-runtime MVP implementation, operational setup, validation evidence, and known constraints.

# Multi-Runtime MVP Implementation

This document captures the February 8, 2026 MVP checkpoint. Later computer-use hardening added capability-aware scheduling, workspace preflights, and separate Goose workspace turn budgets; use [README.md](../../README.md) and [harnesses-implementation.md](./harnesses-implementation.md) for current operational behavior.

## Summary
- `plebdev-bench` now runs a single benchmark matrix across multiple runtimes (`ollama`, `vllm`) and multiple harnesses (`direct`, `goose`, `opencode`) in one command.
- Harness adapters were generalized to be runtime-aware through `runtime.apiFormat` and runtime base URLs.
- vLLM runtime support is now production-usable for the MVP path, including model listing, health checks, and OpenAI-compatible generation.
- The dashboard consumes and renders cross-runtime data from `results/index.json` and `run.json` without requiring schema forks per runtime.
- Validation run `20260208-122510-cb6911` completed with high stability (53/54 items complete, 91.2% pass rate).

## Scope
- In scope:
  - Multi-runtime execution in one run plan.
  - Cross-runtime canonical model mapping for apples-to-apples comparisons.
  - Runtime-aware harness behavior for `direct`, `goose`, and `opencode`.
  - vLLM compatibility through an external OpenAI-compatible endpoint.
  - Dashboard compatibility with richer run metadata and failure types.
  - Stale/hung process handling improvements in OpenCode harness.
  - Branch-level tracked result snapshots for MVP evidence.
- Out of scope:
  - Automatic lifecycle orchestration of runtime daemons/containers during a run.
  - Full elimination of model/harness quality variability (for example, `todo-app` blind variability).
  - Automatic recovery/retry for individual item failures (items are recorded as failures and execution continues).

## Current Behavior

### End-to-end run behavior
- `bench run` builds one plan spanning:
  - runtime × harness × model × test × passType
- Plan and results are persisted as:
  - `results/<run-id>/plan.json`
  - `results/<run-id>/run.json`
- Per-item failures are captured in structured form and do not crash the whole run.
- Process exits non-zero only on crash/setup failure, consistent with MVP rules.

### Runtime behavior
- `ollama` runtime:
  - Native Ollama HTTP API format.
- `vllm` runtime:
  - OpenAI-compatible API format (`/v1/*`).
  - Health check strategy: `/health`, fallback to `/v1/models`.
  - Model-size estimation for timeout scaling is inferred from model name patterns.

### Harness behavior by runtime
- Compatibility map (`HARNESS_RUNTIME_COMPATIBILITY`) now enables all harnesses on both runtimes:
  - `direct`: `ollama`, `vllm`
  - `goose`: `ollama`, `vllm`
  - `opencode`: `ollama`, `vllm`

- `direct` harness:
  - Dispatches based on `runtime.apiFormat`.
  - Uses Ollama generation client for `ollama`.
  - Uses OpenAI-compatible generation client for `vllm`.

- `goose` harness:
  - Maps runtime to Goose provider (`ollama` vs `openai`).
  - For OpenAI-compatible runtimes, configures host/base path env vars from runtime URL.
  - Uses model override flags (`--provider`, `--model`) to avoid stale CLI config.
  - Extracts code from tool-call-like outputs or markdown fallback.

- `opencode` harness:
  - Builds runtime-specific provider config dynamically in `opencode.json`.
  - Uses slash-safe model keys for CLI transport where needed.
  - Enforces timeout and stale-output kill logic.
  - Uses `Promise.race` between process completion and timeout/stale guards to avoid indefinite hangs.
  - Extracts code from tool calls and JSONL stream output, then falls back to markdown extraction.

### Tool-smoke gate behavior
- Tool-calling harnesses use `tool-smoke` as a preflight signal.
- If `tool_missing` is detected for a harness/model pair, subsequent items for that pair are skipped and recorded as failed with structured reason.

### Dashboard behavior
- Dashboard types mirror run schema for:
  - generation/scoring/frontier-eval failures,
  - runtime/harness/model/test/passType dimensions,
  - compare deltas.
- Dev server serves `/results/*` directly through Vite middleware.
- Run index generation is performed by:
  - `bun run dashboard:index`

## Architecture

### Core modules involved
- CLI orchestration:
  - `src/cli/run-command.ts`
  - `src/runner/index.ts`
  - `src/runner/item-executor.ts`
- Runtime implementations:
  - `src/runtimes/ollama-runtime.ts`
  - `src/runtimes/vllm-runtime.ts`
- Harness implementations:
  - `src/harnesses/direct-adapter.ts`
  - `src/harnesses/goose-adapter.ts`
  - `src/harnesses/opencode-adapter.ts`
  - `src/harnesses/harness.ts`
- Dashboard data model:
  - `apps/dashboard/src/lib/types.ts`
  - `apps/dashboard/src/lib/aggregations.ts`

### Data flow
1. CLI parses runtime/model/harness/test selections and optional model-profile mappings.
2. Plan builder resolves matrix items with explicit runtime+harness+model coordinates.
3. Runner computes dynamic timeouts using runtime model info estimates.
4. Item executor runs generation through selected harness/runtime pair.
5. Scoring and optional frontier eval are attached per item.
6. Result files are written and dashboard reads them via `/results`.

### Runtime lifecycle boundary
- Runtime lifecycle (for example `docker compose up/down`, `ollama serve`) is external to benchmark execution.
- `runBenchmark` does not start/stop runtime daemons.

## Interfaces

### User-facing commands
- Full cross-runtime execution:
  - `bun pb --runtimes ollama vllm --harnesses direct goose opencode --models qwen3-27b-instruct --model-config models.example.json`
- Dashboard:
  - `bun run dashboard:index`
  - `bun run dashboard -- --host 127.0.0.1 --port 5173`

### Model profile contract
- A single logical benchmark model maps to one canonical profile plus one or more runtime-specific variants.
- Canonical profile fields capture stable identity:
  - family / parameter scale / tuning
  - stable `profileKey`
- Variant fields capture runtime-specific execution details:
  - runtime model name
  - format (for example `MLX`, `GGUF`)
  - quantization (for example `4-bit`, `Q4_K_M`)
- Legacy alias-only mappings are still accepted, but current configs should prefer the richer model-profile structure.

### Failure-record contract
- `run.json` item records may include:
  - `generationFailure`
  - `scoringFailure`
  - `frontierEvalFailure`
- Failure typing is preserved for analysis and dashboard rendering.

## Configuration

### Runtime URLs
- Ollama default URL:
  - `http://localhost:11434`
- vLLM default URL:
  - `http://localhost:8000`

### vLLM endpoint baseline
- Expected server shape:
  - OpenAI-compatible HTTP API
- Default host port:
  - `8000`
- CLI flag:
  - `--vllm-url`

### Auth behavior
- OpenAI-compatible harness paths accept `VLLM_API_KEY` or `OPENAI_API_KEY`.
- If missing, harnesses currently use a dummy key for local OpenAI-compatible endpoints that do not enforce auth.

### Timeouts
- Global timeout starts from CLI `--timeout`.
- Dynamic timeout scaling uses model-size estimates and harness type.
- OpenCode adds stale-output kill threshold in addition to global timeout.

## Security & Privacy
- Secrets are consumed from environment; they are not written to run artifacts.
- Failure logs include bounded output previews for diagnostics.
- Result files may include generated code output and scoring evidence; treat run artifacts as sensitive depending on prompts/data.

## Observability
- Deterministic item progress output (`item NN/TT`) during runs.
- Structured failure logging per item with `failureType`.
- Rich run summaries include:
  - completion/failure counts,
  - pass-rate breakdown by harness/model/test,
  - optional frontier-eval aggregates.

## Validation Evidence

### Primary MVP validation run
- Run ID:
  - `20260208-122510-cb6911`
- Command profile:
  - runtimes: `ollama`, `vllm`
  - harnesses: `direct`, `goose`, `opencode`
  - tests: all discovered (`tool-smoke`, `smoke`, `calculator-basic`, `calculator-stateful`, `todo-app`)
  - canonical model profile: `qwen3-27b-instruct`
- Outcome:
  - completed: `53/54`
  - failed: `1`
  - pass rate: `91.2% (715/784)`
  - by harness:
    - direct: `94.8%`
    - opencode: `90.1%`
    - goose: `88.6%`
  - by model:
    - ollama `qwen2.5:14b`: `92.5%`
    - vLLM `Qwen/Qwen2.5-14B-Instruct`: `89.8%`

### Engineering gate checks
- Typecheck:
  - `bun run typecheck` passed.
- Dashboard build:
  - `bun run dashboard:build` passed.
- Test suite:
  - `bun run test` passed after updating two suites to `vitest` imports.

## Edge Cases
- vLLM instability under constrained memory can surface as runtime 500 errors.
- Tool-calling harnesses may return assistant text without valid tool output; fallback extraction handles many but not all variants.
- `todo-app` blind pass remains a known variability hotspot across harnesses/models.
- OpenCode may emit long JSON streams with delayed useful output; stale detection mitigates indefinite hangs but does not guarantee semantic success.

## Known Limitations
- Runtime process lifecycle is not managed by benchmark orchestration.
- No per-item retry policy is currently applied for transient runtime API failures.
- Dashboard relies on local filesystem-backed `/results` serving in dev mode.

## Open Questions
- Should runtime lifecycle orchestration (start/wait/stop) become first-class in CLI flows?
- Should flaky/failure-prone matrix cells get optional bounded retries?
- Should large generation outputs be moved to artifact files by default to keep `run.json` smaller?

## Change Notes
- Multi-runtime harness compatibility map expanded to include all harnesses on `ollama` and `vllm`.
- Goose adapter updated for OpenAI-compatible runtime routing, model/provider overrides, and better output normalization.
- OpenCode adapter updated with:
  - runtime-aware provider config,
  - slash-safe model keys,
  - timeout + stale-output kill strategy using `Promise.race`,
  - improved tool-call/code extraction.
- vLLM Docker compose configuration updated for current MVP runtime usage.
- Dashboard schema/aggregation/UI updates applied to handle multi-runtime and richer failure metadata.
- Test suite compatibility fixed by replacing `bun:test` imports with `vitest` in:
  - `test/vllm-runtime.test.ts`
  - `test/harness-compatibility.test.ts`
