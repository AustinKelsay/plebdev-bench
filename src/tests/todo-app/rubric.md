# Evaluation Rubric: todo-app

Score the generated code from 1-10 based on the following criteria:

## Correctness (40%)
- Factory function `createTodoApp` is exported
- addTodo creates todos with unique incrementing ids
- toggleTodo correctly flips completed status
- deleteTodo removes todos and returns correct boolean
- Filtering methods return correct subsets

## Data Integrity (25%)
- Todo objects have correct shape (id, text, completed)
- IDs are unique and incrementing
- State is properly encapsulated
- Multiple instances don't share state

## API Design (20%)
- Method signatures match specification
- Appropriate return values for each operation
- Graceful handling of non-existent ids
- No side effects on returned objects

## Code Quality (15%)
- Clean, readable implementation
- Proper TypeScript types
- Efficient filtering operations
- No memory leaks or dangling references

## Scoring Guide
- 9-10: Excellent - Full CRUD functionality, proper state management
- 7-8: Good - All operations work, minor issues with types or edge cases
- 5-6: Acceptable - Most operations work, filtering partially broken
- 3-4: Poor - Missing CRUD operations or broken state
- 1-2: Failing - Code doesn't run or missing createTodoApp
