# Smoke Test

A simple benchmark test to verify the pipeline works end-to-end.

## Task

Write a TypeScript function called `add` that takes two numbers and returns their sum.

## Pass Criteria

- Function is named `add`
- Takes two numeric parameters
- Returns the sum of the two numbers
- Uses TypeScript syntax

## Example

```typescript
function add(a: number, b: number): number {
  return a + b;
}

// Usage
add(2, 3); // returns 5
```

## Scoring

**Automated (placeholder for MVP):**
- Parse output for function definition
- Check function name matches `add`

**Frontier eval (out of scope for setup):**
- Code correctness
- TypeScript type annotations
- Code clarity
