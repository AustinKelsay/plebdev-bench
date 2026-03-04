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

Requirements:
- Default TTL should be 1000ms.
- `set` supports an optional per-entry TTL override.
- Expiration boundary should be deterministic and strict.
- The cache should correctly support `undefined` as a stored value.
- `size(nowMs)` should represent only currently live entries.
- `clear()` removes everything.
- Must export `createTtlCache` as a function (no classes as the primary exported API).
