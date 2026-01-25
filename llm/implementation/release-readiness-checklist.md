Purpose: Release readiness checklist for `plebdev-bench` (security, determinism, docs, and operational readiness).

# Release Readiness Checklist

## Security & Privacy
- [ ] OpenRouter API key read from env only and never persisted
- [ ] Logs redact secrets (authorization headers, api keys)
- [ ] Failure logs do not include raw prompts or full generated output

## Results & Schema Stability
- [ ] `plan.json` and `run.json` validate with Zod on read/write
- [ ] `schemaVersion` is present and matches CLI-supported versions
- [ ] Additive schema changes only (breaking changes require explicit migration plan)
- [ ] Per-item failures recorded (`generationFailure`, `scoringFailure`, `frontierEvalFailure`)

## Determinism & Failure Modes
- [ ] `bench run` exits non-zero only on crashes
- [ ] Per-item failures do not abort the matrix
- [ ] `bench compare` output is deterministic for identical inputs

## Timeouts & Retries
- [ ] All `fetch` calls have abort timeouts
- [ ] OpenRouter eval uses bounded retries (default max attempts)
- [ ] Execa calls include timeouts and force-kill safeguards
- [ ] Scoring import uses a hard timeout

## Performance & Artifacts
- [ ] Large `run.json` payloads emit a warning (or are moved to artifacts)
- [ ] No runaway logging in normal runs

## Dependencies & Reproducible Builds
- [ ] `bun.lock` is present and committed
- [ ] Dependency audit complete (remove unused, pin where needed)
- [ ] Document update cadence for critical deps

## Docs & UX
- [ ] README and `llm/context/codebase-overview.md` reflect current CLI behavior
- [ ] Hardening notes documented (`llm/implementation/review-and-hardening-implementation.md`)
- [ ] Known limitations recorded (local-only, best-effort metrics)

## Sign-off
- Release version:
- Date:
- Reviewer:
- Notes:
