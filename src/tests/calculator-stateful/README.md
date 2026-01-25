# calculator-stateful

Stateful calculator with running total and memory functions.

## Requirements

Generate TypeScript code that exports a `createCalculator` factory function that returns a calculator object with the following methods:

### Core Operations
- `add(n: number)` - Add n to current value, returns calculator for chaining
- `subtract(n: number)` - Subtract n from current value, returns calculator for chaining
- `multiply(n: number)` - Multiply current value by n, returns calculator for chaining
- `divide(n: number)` - Divide current value by n, returns calculator for chaining
- `result()` - Returns the current value
- `clear()` - Resets current value to 0, returns calculator for chaining

### Memory Functions
- `memoryStore()` - Store current value in memory, returns calculator for chaining
- `memoryRecall()` - Returns the stored memory value
- `memoryClear()` - Clear memory to 0, returns calculator for chaining
- `memoryAdd()` - Add current value to memory, returns calculator for chaining

## Acceptance Criteria

### Basic Operations
- Calculator starts with value 0
- Operations modify the running total
- Method chaining works: `calc.add(5).multiply(2).result()` returns 10
- Clear resets to 0

### Memory
- Memory starts at 0
- memoryStore saves current value
- memoryRecall returns stored value without modifying it
- memoryAdd adds current value to memory
- memoryClear resets memory to 0

## Pass Criteria

The generated code passes if:
1. `createCalculator` function is exported
2. All methods are implemented
3. Method chaining works correctly
4. Memory functions work independently of calculator state
