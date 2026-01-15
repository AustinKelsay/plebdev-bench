# calculator-basic

Stateless arithmetic calculator with four basic operations.

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
- Very large numbers are handled without overflow errors

## Pass Criteria

The generated code passes if:
1. All four functions are exported
2. All functions have correct signatures (2 number params, returns number)
3. Test cases pass for basic operations
4. Edge cases are handled appropriately
