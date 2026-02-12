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
export function createCalculator(): Calculator
```

Interface:
```ts
interface Calculator {
  add(n: number): Calculator
  subtract(n: number): Calculator
  multiply(n: number): Calculator
  divide(n: number): Calculator
  clear(): Calculator
  result(): number
  memoryStore(): Calculator
  memoryRecall(): number
  memoryClear(): Calculator
  memoryAdd(): Calculator
}
```

Behavior:
- Initial value is 0; memory is 0
- Operations update the current value and return `this` for chaining
- Memory is independent from the current value (clear does not change memory)
- `memoryAdd()` adds current value into memory and does NOT change current value
- Must export `createCalculator` as a function (do not export a class as the primary API)
