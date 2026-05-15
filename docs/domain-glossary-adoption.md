# Domain glossary adoption

This note records how the benchmark glossary is being adopted across existing schemas, dashboard payloads, docs, and agent workflow setup. It is intentionally not an artifact migration plan.

## Scope

- Canonical glossary: `CONTEXT.md`
- Decision record: `docs/adr/`
- Agent setup: `docs/agents/`
- Parent PRD: GitHub issue #26

## Schema and Type Naming Inventory

| Current name | Glossary term | Classification | Recommendation |
| --- | --- | --- | --- |
| `passType` | **Pass Type** | Harmless internal/persisted naming | Keep. It already matches the glossary except for code casing. |
| `model` on Matrix Items | **Runtime Model** | User-facing documentation drift risk | Keep the persisted field for compatibility. Document it as the exact Runtime Model identifier. |
| `modelAlias` | **Model Profile** compatibility alias | Migration-worthy only if artifact schema is intentionally bumped | Keep as deprecated compatibility field. Do not rename without an ADR and artifact migration. |
| `modelProfile.canonical` | **Model Profile** | Harmless internal/persisted naming | Keep. It encodes the canonical profile shape clearly. |
| `modelProfile.variant` | **Model Variant** | Harmless internal/persisted naming | Keep. It encodes runtime-specific variant detail clearly. |
| `runtimeModelName` | **Runtime Model** | Harmless internal naming | Keep. It is clearer than the persisted Matrix Item `model` field. |
| `category` | **Benchmark Category** | User-facing documentation drift risk | Keep the persisted field. In prose, describe it as Benchmark Category. |
| `test` | **Benchmark Test** | User-facing documentation drift risk | Keep the persisted field. In prose, describe it as Benchmark Test slug. |
| `benchmarkCheckpoint` | **Benchmark Checkpoint** | Harmless internal/persisted naming | Keep. It matches the glossary. |
| `checkpointId` | **Benchmark Checkpoint** identifier | Harmless internal/persisted naming | Keep. It is the identifier field inside the Benchmark Checkpoint. |
| `manifestHash` | Evidence for **Benchmark Checkpoint** | User-facing documentation drift risk | Keep. Avoid presenting it as the domain concept. |
| `machine.profileKey` | **Machine Profile** identifier | Harmless internal/persisted naming | Keep. It is the canonical profile key. |
| `machine.instanceId` | **Machine Instance** identifier | Harmless internal/persisted naming | Keep. It matches the glossary. |
| `machineProfileId` | Deprecated **Machine Profile** compatibility alias | Migration-worthy only if dashboard artifact schemas are intentionally bumped | Keep as deprecated alias until a future compatibility-managed removal. |
| `machineLabel` | Deprecated display alias | Harmless compatibility alias with documentation drift risk | Keep as dashboard compatibility field; prefer `machineDisplayLabel` or `machineProfileLabel` in new code. |
| `run.partial.json` | **Partial Run Result** | User-facing documentation drift risk | Keep filename. Explain it as the Partial Run Result, not a checkpoint or snapshot. |
| `frontierEval` | **Frontier Eval** | Harmless internal/persisted naming | Keep. It matches the glossary except for code casing. |
| `automatedScore` | **Automated Score** | Harmless internal/persisted naming | Keep. It matches the glossary except for code casing. |
| `signalAssessment` | **Signal Assessment** | Harmless internal/persisted naming | Keep. It matches the glossary except for code casing. |
| `vllm` artifact runtime | Historical **Runtime** value | Compatibility-only artifact support | Keep readable for historical Run Results. Do not reintroduce active execution without a new ADR. |

## Deferred Migration Candidates

These should not be changed in the current glossary-adoption pass:

- Removing `modelAlias`.
- Removing `machineProfileId` or `machineLabel`.
- Renaming persisted Matrix Item fields `model`, `test`, or `category`.
- Renaming `run.partial.json`.
- Removing dashboard support for historical `vllm` artifacts.

Any future change here needs a schema-version bump, compatibility plan, dashboard fixture coverage, and likely an ADR.

## Agent Workflow Setup Review

The agent workflow setup is present and intentionally single-context:

- `CLAUDE.md` contains one `## Agent skills` block.
- `docs/agents/issue-tracker.md` points skills at GitHub Issues for `AustinKelsay/plebdev-bench`.
- `docs/agents/triage-labels.md` maps the default triage labels.
- `docs/agents/domain.md` tells skills to read root `CONTEXT.md` and root `docs/adr/`.

No duplicate agent-skills block was added to `AGENTS.md`.

## Validation Tooling Decision

Do not add automated glossary linting yet.

The current repo is still stabilizing its domain language across docs, dashboard copy, compare output, and artifact compatibility aliases. A strict term linter would likely produce noisy false positives because persisted field names like `model`, `test`, `category`, `machineProfileId`, and `run.partial.json` are intentionally retained for compatibility.

Use a lightweight manual checklist for now:

- Does new prose use glossary terms from `CONTEXT.md` for domain concepts?
- Does user-facing copy avoid treating implementation evidence, such as `manifestHash`, as the domain concept?
- Does any schema or persisted-field rename include an explicit migration plan?
- Does any change contradict an ADR under `docs/adr/`?
- Are compatibility aliases described as aliases rather than new canonical language?

Revisit automation after a few glossary-alignment PRs have landed and the false-positive patterns are clearer.
