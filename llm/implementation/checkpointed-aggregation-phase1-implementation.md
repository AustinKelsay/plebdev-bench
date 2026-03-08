Purpose: Document phase-1 implementation for checkpointed cross-run aggregation, machine metadata, and leaderboard ingestion.

# Checkpointed Aggregation + Hardware Provenance (Phase 1)

## What changed

- Added benchmark checkpoint metadata (`checkpointId`, `manifestHash`, `assetCount`, `computedAt`) to run artifacts.
- Added machine metadata with sanitized hardware profile:
  - `platform`, `arch`, `osRelease`, `cpuModel`, `logicalCores`, `totalMemoryBytes`
- Added run provenance metadata with `verificationStatus` and `source`.
- Added machine-aware checkpoint aggregation by:
  - `machineProfileId + runtime + model + harness + test + passType`
  - strongest-result selection first, with recency only as a tiebreaker
- Added dashboard leaderboard route (`/leaderboard`) backed by `results/aggregates/latest.json`.
- Added compare guardrail that blocks cross-checkpoint compares unless `--allow-cross-checkpoint`.

## New/updated modules

- `src/lib/benchmark-checkpoint.ts`
- `src/lib/hardware-profile.ts`
- `src/results/aggregate.ts`
- `apps/dashboard/scripts/build-index.ts` (v2 index + checkpoint aggregates)

## Schema updates

- Bumped `SCHEMA_VERSION` to `0.3.0`.
- Extended `RunPlan` and `RunResult` with optional:
  - `machine`
  - `benchmarkCheckpoint`
  - `provenance`
- Replaced plan `environment` with `runtimeEnvironment` for new artifacts.
- Dashboard index upgraded to v2:
  - `schemaVersion`, `generatedAt`, `latestCheckpointId`, `runs[]`, `checkpoints[]`
- Kept legacy dashboard index compatibility (array format) for read-only fallback.

## CLI and behavior updates

- New run options:
  - `--machine-id <id>`
  - `--machine-label <label>`
- Machine identity resolution precedence:
  - CLI config
  - `BENCH_MACHINE_ID` / `BENCH_MACHINE_LABEL`
  - deterministic anonymous ID (`anon_<hash>`)

## Dashboard behavior

- `/leaderboard` is now the default route.
- Leaderboard displays latest-checkpoint aggregate only.
- Legacy runs remain visible in run history and are excluded from latest-checkpoint aggregate.

## Verification and testing

Added tests for:
- checkpoint determinism and change detection
- hardware profile identity resolution
- checkpoint aggregation semantics
- build-index artifact generation
- compare checkpoint guardrail

Validation commands run:
- `bun test`
- `bun run typecheck`
- `bun run dashboard:build`
- `bun run dashboard:index`
