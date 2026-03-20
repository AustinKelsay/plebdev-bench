# Goose Headless Hardening

Purpose: Document Goose reliability hardening for non-interactive benchmark runs.

## What changed

1. Adaptive retry turns
- First attempt uses `gooseMaxTurns` (default: `1`).
- Retry attempt uses `gooseRetryMaxTurns` (default: `3`).
- Retry turns are always clamped to be `>=` initial turns.
- Workspace-mode first attempt uses `gooseWorkspaceMaxTurns` (default: `8`).
- Workspace-mode retry uses `gooseWorkspaceRetryMaxTurns` (default: `12`).
- Workspace retry turns are always clamped to be `>=` workspace initial turns.

2. Explicit turn-limit detection
- Harness output policy now classifies turn-limit chatter as `reason: "turn_limit"`.
- Matches phrases such as:
  - "reached the maximum number of actions"
  - "without user input"
  - "would you like me to continue"

3. New CLI/config knobs
- `--goose-max-turns <n>`
- `--goose-retry-max-turns <n>`
- `--goose-workspace-max-turns <n>`
- `--goose-workspace-retry-max-turns <n>`
- Schema validation enforces `gooseRetryMaxTurns >= gooseMaxTurns`.
- Schema validation enforces `gooseWorkspaceRetryMaxTurns >= gooseWorkspaceMaxTurns`.
- Resolved values are persisted in `plan.json` under `config` for reproducibility.

4. Stronger prompt contract
- Tool-calling prompt contract now explicitly instructs:
  - never ask for user input, confirmation, approval, or whether to continue.
- Workspace-mode prompts now include the resolved workspace root path and explicitly tell Goose to stay inside that root.

## Operational guidance

- Start with defaults (`1` / `3` for code-output, `8` / `12` for workspace) unless you are tuning throughput aggressively.
- If a model still frequently emits turn-limit chatter on Goose-informed passes, increase retry turns first.
- If Goose underperforms on workspace tests with empty or partial filesystem edits, check workspace turn budgets before concluding the prompt or test is at fault.
- If a Goose workspace row fails, verify first that the task is truly read/write-only and does not depend on undeclared directory creation.
- Keep initial turns low on code-output runs to avoid long exploratory/off-task Goose sessions.
