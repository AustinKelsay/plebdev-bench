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
export function createRateLimiter(): RateLimiter

interface RateLimiter {
  allow(key: string, nowMs: number): boolean
  remaining(key: string, nowMs: number): number
  reset(key: string): void
}
```

Behavior:
- Fixed policy: `limit = 3`, `windowMs = 1000`
- Fixed-window policy per key
- A key can succeed exactly `limit` times per window
- Rejected calls must return `false` and remaining quota must not go below 0
- Boundary reset rule: if `nowMs - windowStart >= windowMs`, start a fresh window for that key
- Keys are independent
- `reset(key)` removes only that key's state
- Must export `createRateLimiter` as a function (no classes as the primary exported API)
