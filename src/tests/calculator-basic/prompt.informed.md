Output only TypeScript code for a single module. No explanations or tool/file usage.
The harness imports your output and calls the exported functions directly.

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
