# calculator-basic

Stateless arithmetic calculator with four basic operations.

## Output Contract

The generated answer must be a single TypeScript module suitable for direct import by the harness:

- Return code only (no prose, no examples, no `console.log`)
- Use top-level named exports for required functions
- Do not wrap required exports in a namespace/class/object

## Requirements

Generate TypeScript code that exports four functions:

- `add(a: number, b: number): number` - Returns sum of a and b
- `subtract(a: number, b: number): number` - Returns difference (a - b)
- `multiply(a: number, b: number): number` - Returns product of a and b
- `divide(a: number, b: number): number` - Returns quotient (a / b)

## Acceptance Criteria

### Basic Operations
- All four operations work correctly with positive integers
- Operations work with negative numbers
- Operations work with zero

### Edge Cases
- Division by zero returns `Infinity` (JavaScript behavior)
- Floating point operations return reasonable results

## Pass Criteria

The generated code passes if:
1. All four functions are exported
2. Exports are top-level named functions
3. All functions have correct signatures (2 number params, returns number)
4. Test cases pass for basic operations and documented edge cases
