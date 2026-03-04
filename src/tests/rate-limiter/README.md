# rate-limiter

Stateful per-key fixed-window rate limiter.

## Output Contract

The generated answer must be a single TypeScript module suitable for direct import by the harness:

- Return code only (no prose, no examples, no `console.log`)
- Export `createRateLimiter` as the primary API function
- Do not use a class as the primary exported API

## Requirements

Generate TypeScript code that exports a `createRateLimiter` factory function.

`createRateLimiter()` must return an object with:

- `allow(key: string, nowMs: number): boolean`
- `remaining(key: string, nowMs: number): number`
- `reset(key: string): void`

## Acceptance Criteria

### Quota Behavior
- The limiter uses a fixed configuration of `limit = 3` and `windowMs = 1000`
- Each key has its own quota and window
- A key is allowed exactly `limit` calls in a window
- Calls after quota is exhausted return `false`
- Rejected calls do not reduce remaining quota below 0

### Window Behavior
- Window expiration is deterministic using `nowMs`
- If `nowMs - windowStart >= windowMs`, a new window starts
- At the boundary, quota is fully reset

### Reset Behavior
- `reset(key)` clears only that key
- Reset key gets full quota immediately

## Pass Criteria

The generated code passes if:
1. `createRateLimiter` function is exported
2. Quota accounting is correct per key
3. Window boundary behavior is correct
4. `reset` works without affecting other keys
