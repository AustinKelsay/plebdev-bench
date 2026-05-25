# PRD: Add Hermes As A First-Class Harness

## Problem Statement

Plebdev Bench can compare local models through direct runtime calls and existing agent harnesses, but it cannot run the Hermes interface as part of a **Benchmark Run**. Users who want to evaluate Hermes against the same **Runtime Models**, **Benchmark Tests**, **Pass Types**, and **Run Comparison** flows must run it outside the benchmark matrix, which loses reproducibility, capability-based exclusions, structured **Benchmark Evidence**, and comparable **Run Results**.

## Solution

Add the **Hermes Harness** as a first-class **Harness** that targets existing **Runtime Models** through the selected **Runtime**. The implementation uses a verified `hermes chat` headless flow, requires strict `solution.ts` artifacts for code-output tests, supports workspace-scored tests through file tools, participates in tool preflight, advertises validated **Harness Capabilities**, and appears in default harness discovery when the CLI feature probe passes.

## User Stories

1. As a benchmark maintainer, I want Hermes modeled as a **Harness**, so that **Runtime** model discovery stays separate from harness behavior.
2. As a benchmark maintainer, I want Hermes to use existing **Runtime Models**, so that model availability remains reproducible and comparable.
3. As a CLI user, I want to run `--harnesses hermes`, so that I can evaluate Hermes without changing other harness runs.
4. As a CLI user, I want Hermes to be explicit-only during the first rollout phase, so that default benchmark runs do not change before Hermes is fully validated.
5. As a CLI user, I want Hermes to enter default discovery after workspace support is proven; this is now the active behavior when the Hermes CLI probe passes.
6. As a CLI user, I want missing or incompatible Hermes installs to fail during planning when Hermes is explicitly selected, so that configuration problems are caught before execution.
7. As a benchmark maintainer, I want Hermes availability to use a real feature probe, so that incompatible CLI versions are not treated as runnable.
8. As a benchmark maintainer, I want Hermes CLI probing isolated behind a small testable module, so that CLI compatibility can evolve without changing planner logic.
9. As a benchmark maintainer, I want Hermes adapter behavior isolated behind the existing harness interface, so that runner execution remains harness-agnostic.
10. As a benchmark maintainer, I want Hermes code-output mode to require `solution.ts`, so that scoring uses a clear **Output Contract**.
11. As a benchmark maintainer, I want Hermes stdout and stderr preserved as diagnostic evidence on failure, so that harness failures can be debugged.
12. As a benchmark maintainer, I want Hermes stdout not to be salvaged as code in the MVP, so that protocol chatter is not accidentally scored as **Generated Output**.
13. As a benchmark maintainer, I want missing `solution.ts` to become a structured **Generation Failure**, so that the **Run Result** explains why the **Matrix Item** failed.
14. As a benchmark maintainer, I want Hermes execution bounded by existing timeouts and, if available, stable turn limits, so that **Benchmark Runs** remain reproducible.
15. As a benchmark maintainer, I want Hermes-specific turn settings only when the CLI exposes stable controls, so that **Run Config** does not gain speculative knobs.
16. As a benchmark maintainer, I want Hermes workspace mode to run inside the prepared **Benchmark Workspace**, so that workspace-scored tests inspect the correct filesystem state.
17. As a benchmark maintainer, I want Hermes to advertise only validated **Harness Capabilities**, so that incompatible combinations become **Combination Exclusions** instead of noisy failures.
18. As a benchmark maintainer, I want Hermes to support workspace read, write, mkdir, search, and delete after validation, so that it can run the full workspace-agent benchmark set.
19. As a benchmark maintainer, I want Hermes included in tool-calling preflight now that workspace mode has landed, so that tool-incompatible Hermes/model pairs stop early.
20. As a benchmark maintainer, I want Hermes early skips keyed by runtime, harness, and model, so that existing runner semantics remain consistent.
21. As a CLI user, I want Hermes run artifacts to include the same matrix coordinates as other harnesses, so that compare and dashboard views can group by harness.
22. As a CLI user, I want Hermes failures recorded per item without crashing the whole run, so that benchmark execution follows existing failure semantics.
23. As a dashboard user, I want Hermes rows to appear as ordinary harness rows, so that I can compare Hermes with Direct, Goose, and OpenCode.
24. As a benchmark maintainer, I want Hermes tool versions captured when possible, so that the **Runtime Environment** explains software provenance.
25. As an implementation agent, I want clear Phase 1 and Phase 2 scopes, so that I can ship a safe vertical slice before widening capability claims.

## Implementation Decisions

- Hermes is the **Hermes Harness**, not a **Runtime** and not a model provider.
- Hermes receives the selected **Runtime**, **Runtime Model**, prompt, timeout, and optional working directory through the existing harness generation interface.
- The first supported runtime target is Ollama through the existing runtime boundary.
- **Model Discovery** remains owned by **Runtime** adapters; Hermes does not discover or select models itself.
- Hermes is registered as a valid harness for explicit selection and default discovery when its CLI probe passes.
- Hermes supports `code-output` and `workspace` prompt modes.
- Code-output mode requires Hermes to write `solution.ts` in the execution workspace.
- Code-output mode returns the `solution.ts` file content as **Generated Output** and returns the file path for existing code-module scoring.
- Code-output mode treats missing, empty, or too-short `solution.ts` as a harness/output-contract failure rather than attempting stdout salvage.
- Hermes advertises workspace **Harness Capabilities** after each operation is validated as non-interactive.
- Hermes is in the tool-calling harness set and the existing preflight/early-skip behavior.
- Hermes CLI compatibility is represented by a deep module that probes command availability, headless chat support, model/provider flags, file tool selection, permission/autonomy flags, and stable turn controls.
- Hermes adapter behavior should be a deep module that hides process execution, prompt construction, artifact validation, and failure shaping behind the stable harness interface.
- Hermes config fields should be added only if the CLI exposes stable turn/step limit controls that affect benchmark execution semantics.
- No ADR is required yet because this follows existing Runtime/Harness separation and capability-exclusion architecture.

## Testing Decisions

- Tests should verify external behavior and contracts, not private implementation details.
- Harness identity tests should cover Hermes name validation, runtime compatibility, and capability map behavior.
- Factory tests should verify that explicit Hermes creation returns a Hermes harness and invalid names still throw.
- CLI probe tests should cover installed, missing, and incompatible Hermes feature shapes without requiring real network or real model execution.
- Discovery tests should verify explicit availability and default discovery when the Hermes CLI probe passes.
- Adapter tests should verify strict `solution.ts` success, missing-file failure, empty-file failure, working-directory handling, timeout propagation, and failure evidence shaping.
- Workspace tests verify read/write/search/mkdir/delete behavior before capabilities are advertised.
- Preflight tests verify Hermes participates in existing tool-calling early skip behavior.
- Schema/config tests cover Hermes-specific turn settings.
- Runtime environment tests cover Hermes version capture as part of **Runtime Environment** collection.
- Prior art includes existing Goose adapter tests, OpenCode adapter tests, OpenCode CLI feature-probe tests, harness compatibility tests, plan builder tests, workspace capability parity tests, and runner preflight behavior tests.

## Out of Scope

- Adding Hermes as a **Runtime**.
- Hermes-owned **Model Discovery**.
- Supporting non-Ollama runtimes in the first pass.
- Salvaging code from Hermes stdout for code-output scoring.
- Changing Direct, Goose, or OpenCode behavior.
- Changing benchmark scoring semantics.
- Changing dashboard aggregation semantics beyond naturally showing Hermes as another harness.
- Creating an ADR before a hard-to-reverse, surprising trade-off appears.
- Including Hermes in default discovery during Phase 1.

## Further Notes

- The settled plan is documented in the implementation plan for Hermes.
- Hermes CLI details were verified against a local install: benchmark execution uses `hermes chat`, provider `custom`, file toolsets, non-interactive permission flags, process `cwd`, and optional `--max-turns`.
- `CONTEXT.md` now records the **Hermes Harness** as domain language and clarifies that it is a **Harness**, not a **Runtime**.
