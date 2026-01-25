# Evaluation Rubric: calculator-basic

Score the generated code from 1-10 based on the following criteria:

## Correctness (40%)
- All four functions (add, subtract, multiply, divide) are implemented
- Functions have correct parameter types (number, number) and return type (number)
- Basic arithmetic operations are correct
- Division by zero is handled (returns Infinity or throws appropriate error)

## Code Quality (30%)
- Code is clean and readable
- Proper TypeScript syntax and types
- Functions are properly exported
- No unnecessary complexity

## Edge Cases (20%)
- Handles negative numbers correctly
- Handles zero correctly
- Handles floating point numbers reasonably
- No runtime errors for valid inputs

## Best Practices (10%)
- Concise implementation
- No side effects
- Pure functions

## Scoring Guide
- 9-10: Excellent - All criteria met, clean implementation, proper types
- 7-8: Good - All operations work, minor issues with types or edge cases
- 5-6: Acceptable - Most operations work, some edge cases fail
- 3-4: Poor - Missing functions or significant errors
- 1-2: Failing - Code doesn't run or is fundamentally broken
