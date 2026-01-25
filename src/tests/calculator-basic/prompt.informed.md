Build a basic calculator in TypeScript.

## Requirements

Export four functions with these exact signatures:

```typescript
export function add(a: number, b: number): number
export function subtract(a: number, b: number): number
export function multiply(a: number, b: number): number
export function divide(a: number, b: number): number
```

## Behavior

- `add(a, b)` returns `a + b`
- `subtract(a, b)` returns `a - b`
- `multiply(a, b)` returns `a * b`
- `divide(a, b)` returns `a / b` (division by zero returns `Infinity`)

## Example Usage

```typescript
add(2, 3)        // 5
subtract(10, 4)  // 6
multiply(3, 7)   // 21
divide(15, 3)    // 5
divide(1, 0)     // Infinity
```
