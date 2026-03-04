Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export:
```ts
export function createTtlCache(): TtlCache

interface TtlCache {
  set(key: string, value: unknown, nowMs: number, ttlMs?: number): void
  get(key: string, nowMs: number): unknown
  has(key: string, nowMs: number): boolean
  delete(key: string): boolean
  size(nowMs: number): number
  clear(): void
}
```

Behavior:
- Fixed default TTL: `1000ms`
- Expire entries when `nowMs >= expiresAt`
- `set` overwrites existing value and refreshes expiration
- Storing `undefined` is valid and must still be reflected by `has(...)`
- `delete` returns `true` when an entry was removed, otherwise `false`
- `size(nowMs)` counts only non-expired entries
- `ttlMs = 0` means immediate expiration
- Must export `createTtlCache` as a function (no classes as the primary exported API)
