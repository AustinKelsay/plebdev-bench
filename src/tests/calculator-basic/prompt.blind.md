Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export functions `add`, `subtract`, `multiply`, `divide` that perform basic arithmetic.
`divide(a, b)` should return `Infinity` when `b` is 0.
Use top-level named exports only (do not wrap required functions in a namespace, class, or object).
