# Hermes Harness Plan

Hermes should become a first-class **Harness** in Plebdev Bench while preserving the existing **Runtime** boundary: **Model Discovery** and **Runtime Models** remain owned by the selected **Runtime**, and Hermes only defines the interface used to ask the model to perform a **Benchmark Test**.

## Settled Decisions

- The integration is the **Hermes Harness**, not a new **Runtime** or provider.
- The first supported runtime target is Ollama through the existing `Runtime` object passed to harness generation.
- Hermes is treated as a workspace-agent harness with `workspace-read`, `workspace-write`, `workspace-mkdir`, `workspace-search`, and `workspace-delete` after real non-interactive smoke validation.
- Hermes uses a real CLI feature probe, not command presence alone.
- Hermes participates in tool-calling preflight and early skip behavior.
- Hermes code-output scoring should trust `solution.ts` written in the execution workspace, not stdout salvage.
- No ADR is needed yet because the plan follows existing Runtime/Harness and capability-exclusion architecture.
- The verified Hermes CLI shape is `hermes chat --provider custom --model <model> --toolsets file --quiet --yolo --accept-hooks [--max-turns n] --query <prompt>` with per-item `HERMES_HOME` config pointing the custom provider at the selected runtime base URL.

## Phase 1: Explicit Code-Output Slice

Goal: prove Hermes can run one code-module **Benchmark Test** through the existing matrix without changing default runs.

Status: complete and superseded by Phase 2 default discovery.

Scope:

- Register `hermes` as a valid **Harness** name.
- Add a Hermes CLI feature-probe module that can verify compatible headless execution.
- Add a Hermes adapter that supports `code-output` prompt mode only.
- Require Hermes to write `solution.ts` in the execution workspace.
- Return the file content as **Generated Output** with `codeFilePath` pointing at `solution.ts`.
- Throw a structured harness failure when `solution.ts` is missing, empty, or too short.
- Preserve Hermes stdout/stderr as diagnostic evidence on failure where practical.
- Keep Phase 1 explicit-only until Phase 2 workspace behavior is validated.
- Defer workspace capabilities to Phase 2.
- Defer tool-calling preflight to Phase 2.

Likely modules:

- Harness identity and compatibility constants.
- Harness factory.
- Harness discovery.
- Hermes CLI feature probing.
- Hermes adapter.
- Bench config only if Hermes has stable turn/step limits that must be controlled for reproducibility.
- Runtime environment collection if Hermes tool version capture is needed for run provenance.

Verification:

- Unit tests for harness-name validation, runtime compatibility, and factory creation.
- Unit tests for Hermes feature-probe parsing and incompatibility cases.
- Unit tests for explicit selection and Phase 2 default discovery behavior.
- Unit tests for strict `solution.ts` success and missing-file failure.
- Manual smoke run with one local model and one small code-module benchmark.

## Phase 2: Workspace-Agent Completion

Goal: make Hermes fully first-class for workspace-form **Generated Output** and default benchmark selection.

Status: complete after real Hermes code-output and workspace smoke runs against local Ollama.

Scope:

- Add `workspace` prompt mode.
- Run Hermes inside the prepared **Benchmark Workspace**.
- Advertise validated workspace **Harness Capabilities** only after each operation works non-interactively.
- Add Hermes to `TOOL_CALLING_HARNESS_NAMES`.
- Include Hermes in tool preflight and existing runtime/harness/model early skip behavior.
- Include Hermes in default auto-discovery once workspace behavior and capability claims are proven.
- Add Hermes-specific turn/step config if Phase 1 confirms stable CLI controls.

Verification:

- Workspace prompt parity tests against existing tool-prompt expectations.
- Capability exclusion tests for Hermes.
- Preflight skip tests for Hermes/model pairs.
- Workspace adapter tests for read/write/search/mkdir/delete behavior.
- Manual smoke runs for workspace tests that require each advertised capability.

## Verified CLI Details

- Command: `hermes chat`.
- Required headless flags: `--query`, `--model`, `--provider`, `--toolsets`, `--quiet`, `--yolo`, and `--accept-hooks`.
- Optional bounded-turn flag: `--max-turns`.
- Ollama transport: per-item `HERMES_HOME/config.yaml` configures provider `custom` with the runtime base URL normalized to `/v1`.
- Working directory: Hermes honors process `cwd`; on macOS the adapter mirrors workspace runs into `/tmp` because Hermes refuses file writes under `/var/folders`.
- Workspace tools: use `--toolsets file`; the adapter rejects textual pseudo tool-call output so harness-level retry can try a real tool invocation.
- Version capture: runtime environment collection can record the `hermes` tool version alongside other harness tools.

## Out Of Scope

- Adding Hermes as a **Runtime**.
- Hermes-owned **Model Discovery**.
- Stdout/code-block salvage for code-output scoring.
- Changing existing Goose or OpenCode behavior.
- Creating an ADR before a genuinely hard-to-reverse trade-off appears.
