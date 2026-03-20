# Targeted Edit

Precision edit benchmark for a bounded workspace.

## Task

- update one existing TypeScript file
- keep field order and unrelated files unchanged
- avoid creating or deleting files

## Pass Criteria

- `src/app-config.ts` matches the expected final contents exactly
- no other file changes occur
