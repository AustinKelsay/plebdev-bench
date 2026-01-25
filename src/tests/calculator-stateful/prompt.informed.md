Output only TypeScript code for a single module. No explanations or tool/file usage.
The harness imports your output and calls the exported functions directly.

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
