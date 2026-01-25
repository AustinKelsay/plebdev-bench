# Evaluation Rubric: calculator-stateful

Score the generated code from 1-10 based on the following criteria:

## Correctness (40%)
- Factory function `createCalculator` is exported
- All arithmetic operations work correctly
- Method chaining is properly implemented
- Memory functions work independently of calculator state
- Clear and memoryClear reset to 0

## API Design (25%)
- Method signatures match specification
- Methods return appropriate values (this for chaining, number for result/recall)
- State is properly encapsulated
- No global state leakage between instances

## Code Quality (20%)
- Clean, readable implementation
- Proper TypeScript types
- Immutable patterns where appropriate
- No unnecessary complexity

## Edge Cases (15%)
- Division by zero handled appropriately
- Multiple instances don't share state
- Memory operations don't affect calculator value
- Clear doesn't affect memory

## Scoring Guide
- 9-10: Excellent - Full functionality, clean API, proper encapsulation
- 7-8: Good - All operations work, minor API or encapsulation issues
- 5-6: Acceptable - Most operations work, chaining or memory partially broken
- 3-4: Poor - Missing major functionality or broken chaining
- 1-2: Failing - Code doesn't run or missing createCalculator
