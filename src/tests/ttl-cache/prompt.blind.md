Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export a factory `createTtlCache` for an in-memory cache with expiration.
Use deterministic timestamps passed in by the caller (`nowMs`) instead of `Date.now()`.

Required API:
```ts
export function createTtlCache(): {
  set(key: string, value: unknown, nowMs: number, ttlMs?: number): void
  get(key: string, nowMs: number): unknown
  has(key: string, nowMs: number): boolean
  delete(key: string): boolean
  size(nowMs: number): number
  clear(): void
}
```

Requirements:
- Must export `createTtlCache` as a function (no classes as the primary exported API).
- Default TTL is 1000ms when `ttlMs` is omitted.
- `set` overwrites existing values and refreshes expiration.
- Expiration is strict and deterministic: entries are expired when `nowMs >= expiresAt`.
- Storing `undefined` is valid; `has(...)` must still report presence correctly for live entries.
- `delete(key)` returns `true` only when an entry existed and was removed.
- `size(nowMs)` counts only currently live (non-expired) entries at that timestamp.
- `clear()` removes all entries.
