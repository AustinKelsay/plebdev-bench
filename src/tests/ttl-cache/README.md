# ttl-cache

In-memory key-value cache with deterministic TTL expiration.

## Output Contract

The generated answer must be a single TypeScript module suitable for direct import by the harness:

- Return code only (no prose, no examples, no `console.log`)
- Export `createTtlCache` as the primary API function
- Do not use a class as the primary exported API

## Requirements

Generate TypeScript code that exports a `createTtlCache` factory function. It should use default TTL of `1000ms` when no per-item TTL is provided.

`createTtlCache()` must return an object with:

- `set(key: string, value: unknown, nowMs: number, ttlMs?: number): void`
- `get(key: string, nowMs: number): unknown`
- `has(key: string, nowMs: number): boolean`
- `delete(key: string): boolean`
- `size(nowMs: number): number`
- `clear(): void`

## Acceptance Criteria

### Expiration
- Expiration is computed from supplied `nowMs`
- Entry is expired when `nowMs >= expiresAt`
- Expired entries are not considered present

### Mutations
- `set` overwrites existing key and refreshes expiration
- `delete` returns true only when key existed and was removed
- `clear` removes all entries

### Defaults and Edge Cases
- Missing per-item TTL uses default TTL
- `ttlMs = 0` expires immediately
- `size(nowMs)` reflects only non-expired entries
- Cache must support storing `undefined` as a value; presence is checked via `has`

## Pass Criteria

The generated code passes if:
1. `createTtlCache` function is exported
2. TTL boundaries are handled correctly
3. Overwrite/delete/clear behavior is correct
4. Cache size and presence checks ignore expired data
