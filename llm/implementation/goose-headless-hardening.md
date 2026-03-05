# Goose Headless Hardening

Purpose: Document Goose reliability hardening for non-interactive benchmark runs.

## What changed

1. Adaptive retry turns
- First attempt uses `gooseMaxTurns` (default: `1`).
- Retry attempt uses `gooseRetryMaxTurns` (default: `3`).
- Retry turns are always clamped to be `>=` initial turns.

2. Explicit turn-limit detection
- Harness output policy now classifies turn-limit chatter as `reason: "turn_limit"`.
- Matches phrases such as:
  - "reached the maximum number of actions"
  - "without user input"
  - "would you like me to continue"

3. New CLI/config knobs
- `--goose-max-turns <n>`
- `--goose-retry-max-turns <n>`
- Schema validation enforces `gooseRetryMaxTurns >= gooseMaxTurns`.
- Resolved values are persisted in `plan.json` under `config` for reproducibility.

4. Stronger prompt contract
- Tool-calling prompt contract now explicitly instructs:
  - never ask for user input, confirmation, approval, or whether to continue.

## Operational guidance

- Start with defaults (`1` and `3`) for throughput.
- If a model still frequently emits turn-limit chatter on Goose-informed passes, increase retry turns first.
- Keep initial turns low to avoid long exploratory/off-task Goose sessions.
