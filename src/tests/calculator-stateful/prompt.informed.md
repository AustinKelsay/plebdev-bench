Build a stateful calculator in TypeScript with method chaining and memory functions.

## Requirements

Export a `createCalculator` factory function:

```typescript
export function createCalculator(): Calculator
```

The returned Calculator object should have these methods:

```typescript
interface Calculator {
  // Operations (return this for chaining)
  add(n: number): Calculator
  subtract(n: number): Calculator
  multiply(n: number): Calculator
  divide(n: number): Calculator
  clear(): Calculator

  // Get result
  result(): number

  // Memory functions
  memoryStore(): Calculator    // Store current value in memory
  memoryRecall(): number       // Return memory value
  memoryClear(): Calculator    // Clear memory to 0
  memoryAdd(): Calculator      // Add current value to memory
}
```

## Behavior

- Calculator starts with value 0 and memory 0
- Operations modify the running total
- Method chaining: `calc.add(5).multiply(2)` works
- Memory is separate from calculator value

## Example Usage

```typescript
const calc = createCalculator()

// Basic operations with chaining
calc.add(10).subtract(3).result()  // 7

// Memory operations
calc.clear().add(5).memoryStore()  // stores 5
calc.clear().add(10).memoryAdd()   // memory now 15
calc.memoryRecall()                // 15

// Chained example
calc.clear()
    .add(100)
    .divide(4)
    .memoryStore()
    .multiply(2)
    .result()  // 50 (memory still holds 25)
```
