Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export a factory `createRateLimiter` that returns an object supporting per-key rate limiting over fixed time windows.
Use deterministic timestamps passed in by the caller (`nowMs`) instead of `Date.now()`.

Requirements:
- Return an object with `allow(key: string, nowMs: number)`, `remaining(key: string, nowMs: number)`, and `reset(key: string)`.
- Use a fixed policy of 3 requests per 1000ms window.
- Key quotas are independent.
- `remaining` must never go below 0.
- Boundary rule: when a window has fully elapsed, the next call starts a fresh window.
- `reset(key)` clears only that key's state.
- Must export `createRateLimiter` as a function (no classes as the primary exported API).
