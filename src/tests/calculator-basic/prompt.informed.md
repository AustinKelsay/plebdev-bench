Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export these functions with exact signatures:
```ts
export function add(a: number, b: number): number
export function subtract(a: number, b: number): number
export function multiply(a: number, b: number): number
export function divide(a: number, b: number): number
```

Behavior:
- `add(a, b)` returns `a + b`
- `subtract(a, b)` returns `a - b`
- `multiply(a, b)` returns `a * b`
- `divide(a, b)` returns `a / b` (division by zero returns `Infinity`)
Use top-level named exports only (do not wrap required functions in a namespace, class, or object).
