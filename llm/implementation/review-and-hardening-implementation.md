Purpose: Document the review-and-hardening changes applied to `plebdev-bench` for security, stability, and release readiness.

# Review & Hardening Implementation

## Summary
- Added structured per-item failure records for generation, scoring, and frontier eval.
- Hardened logging (redaction + truncation) and OpenRouter retries/timeouts.
- Added determinism safeguards for compare output and import timeouts for scoring.
- Isolated scoring in a short-lived subprocess by default to bound Bun memory growth on long runs.
- Added periodic `run.partial.json` snapshots for crash-safe progress recovery.
- Documented threat model, retention defaults, and release checklist.

## Scope
- In scope:
  - Secrets handling + logging redaction
  - Structured failure recording in `run.json`
  - Bounded timeouts/retries for network and scoring import
  - Deterministic compare output
  - Release readiness checklist + docs updates
- Out of scope:
  - New harness adapters or new benchmark tests
  - Major refactors beyond hardening
  - Moving all outputs to artifacts (deferred; see retention defaults)

## Current Behavior
- API keys are read from environment only (never persisted).
- `run.json` includes generation output, scoring summary, frontier eval, and failure records.
- `run.partial.json` is checkpointed during execution and removed after successful completion.
- OpenRouter eval uses bounded retries with timeouts and records structured failures.
- Compare output is deterministic (matched + exclusive items sorted by key).
- Large `run.json` payloads log a warning for operator visibility.

## Architecture
### Trust boundaries / data flow
- **Filesystem**: `results/<run-id>/plan.json` + `run.json`; periodic `run.partial.json` snapshots are validated via Zod.
- **Network (fetch)**: OpenRouter (frontier eval), Ollama HTTP (model discovery + generation).
- **Process execution (execa)**: Goose/OpenCode CLIs for generation; scorer worker isolation; OpenCode server lifecycle.

### Sensitive data
- **Secrets**: `OPENROUTER_API_KEY` (env only).
- **Potentially sensitive content**: prompts, generated code, eval reasoning, stderr from harnesses.

### Retention defaults
- **Default**: generation output + eval reasoning are stored inline in `run.json`.
- **Artifacts**: not yet split out; a size warning is emitted for large `run.json`.

## Interfaces
- `evaluateWithFrontier(...)` returns a structured outcome:
  - `{ ok: true, value }` with score/reasoning/model/latency
  - `{ ok: false, failure }` with type/message/status/attempts
- `MatrixItemResult` now includes:
  - `generationFailure`, `scoringFailure`, `frontierEvalFailure` (optional)

## Configuration
- `OPENROUTER_API_KEY` enables frontier eval (env-only).
- `generateTimeoutMs` controls generation timeouts.
- Frontier eval retries are bounded (default: 2 attempts).
- `PLEBDEV_BENCH_SCORER_MODE` controls scoring mode (`process` default, `in-process` for debugging).

## Security & Privacy
- Logger redaction masks API keys and authorization headers.
- Failure logs and previews are truncated to prevent runaway logging.
- OpenRouter API key is never written to `plan.json` or `run.json`.

## Observability
- Per-item failure records are captured in `run.json`.
- Periodic crash-safe progress snapshots are captured in `run.partial.json`.
- Log warnings are emitted for OpenRouter failures and oversized `run.json`.
- Progress output remains terminal-native and non-interactive.

## Edge Cases
- Frontier eval returns malformed JSON or empty responses → `frontierEvalFailure` recorded.
- Scoring import hangs → `importWithTimeout` fails fast after timeout.
- Bun memory growth in long-lived scoring loops → bounded by subprocess scorer isolation.
- Very large run payloads → warning emitted before write.

## Open Questions
- Should outputs above a size threshold move to `results/<run-id>/artifacts/` by default?
- Should frontier eval failures be summarized in run-level stats?

## Change Notes
- Added failure type enums for frontier eval and failure record schemas.
- Added compare determinism tests.
- Updated docs to remove compare “stub” references and add hardening checklist.
- Fixed strictness/timeout issues in `openrouter-client.ts` and `scorer.ts`.
- Added scorer isolation tests and checkpoint asset updates for benchmark checkpoint hashing.
