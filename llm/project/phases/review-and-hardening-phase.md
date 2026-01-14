Purpose: Optional final phase for review, security hardening, and release readiness for `plebdev-bench`.

# Review & Hardening Phase (Optional)

Run this phase after the MVP is stable and before a public launch, major release, or external audit. It is a deliberate pause to verify quality, security, and operational readiness.

## Goals
- Identify and address security and privacy risks (especially API keys + result artifacts).
- Validate critical benchmark flows against requirements (run → results → compare).
- Ensure operational readiness for repeated runs on a single machine.
- Confirm release gates and sign-off criteria.

## Scope
- In scope:
  - Secrets handling (OpenRouter API key), logging redaction, result retention
  - Dependency audit and reproducible builds
  - Determinism and failure-mode review (crash-only non-zero exit, per-item failures recorded)
  - Performance sanity checks (timeouts, runaway logs, huge `run.json`)
  - Release readiness (docs, versioning, compatibility expectations)
- Out of scope:
  - New harnesses or benchmark tests
  - Major refactors not required for risk mitigation

## Entry Criteria

- MVP flow is implemented and stable:
  - `bench run` produces `results/<run-id>/plan.json` + `run.json`
  - `bench compare` can diff two runs deterministically
- Result schemas have `schemaVersion` and are validated at read/write boundaries.
- There is at least one implementation note in `llm/implementation/` describing:
  - result format + invariants, and
  - key IO boundaries (fetch/execa/fs)

## Steps (3–5 actionable items)

1. **Threat model + data flow review (local CLI)**
   - Map trust boundaries: filesystem (`results/`), `fetch` (OpenRouter/Ollama), `execa` (harness CLIs).
   - Identify sensitive data: OpenRouter API key, prompts, generated code, logs, eval reasoning.
   - Decide retention defaults (what goes into `run.json` vs optional `artifacts/` files).

2. **Secrets + logging hardening**
   - Ensure API keys are read from environment only and never persisted to disk.
   - Add log redaction rules for headers/keys and any request metadata.
   - Verify `--verbose` still avoids leaking secrets.

3. **Result safety + schema stability**
   - Enforce that `run.json` and `plan.json` validate with Zod on write and read.
   - Define explicit “failure shapes” for per-item failures (timeouts, HTTP errors, eval failures).
   - Add a compatibility note: which schema versions the CLI can read and how migrations work.

4. **Determinism + failure-mode verification**
   - Verify the non-interactive contract and crash-only non-zero exit behavior.
   - Validate bounded retries/timeouts for `fetch` and `execa` to prevent hung runs.
   - Add regression tests for compare output determinism (same inputs → same deltas).

5. **Release readiness checklist**
   - Audit dependencies (remove unused, pin where needed, document update cadence).
   - Confirm docs are accurate: `README.md`, `llm/project/*`, and key `llm/implementation/*`.
   - Record a release checklist + known limitations (local-only, best-effort energy metrics).

## Exit Criteria
- High/critical issues resolved or explicitly accepted (documented in a hardening note).
- Verified: no secrets written to disk or logs by default, including failure paths.
- Verified: timeouts/retries prevent hung runs; per-item failures are recorded and the run continues.
- Verified: schema validation on read/write; compare is deterministic.
- Release checklist signed off and archived (link from `README.md` or `llm/implementation/`).

## Suggested Agent Prompt
```
Create a review-and-hardening checklist tailored to our project.
Use @llm/project/project-overview.md, @llm/project/tech-stack.md, @llm/project/project-rules.md, and any relevant @llm/implementation/ docs.
Focus on security, privacy, operational readiness, and release gates. Ask clarifying questions if needed.
```
