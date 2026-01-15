# todo-app

Simple todo list manager with CRUD operations and filtering.

## Requirements

Generate TypeScript code that exports a `createTodoApp` factory function that returns a todo app object with the following methods:

### CRUD Operations
- `addTodo(text: string)` - Add a new todo, returns the created todo object with id
- `getTodo(id: number)` - Get a todo by id, returns todo or undefined
- `toggleTodo(id: number)` - Toggle completed status of a todo
- `deleteTodo(id: number)` - Remove a todo by id, returns boolean

### List Operations
- `listTodos()` - Returns array of all todos
- `listCompleted()` - Returns array of completed todos
- `listPending()` - Returns array of pending (not completed) todos
- `clearCompleted()` - Remove all completed todos

### Todo Object Shape
```typescript
interface Todo {
  id: number
  text: string
  completed: boolean
}
```

## Acceptance Criteria

### Adding Todos
- Each todo gets a unique incrementing id
- New todos start with `completed: false`
- Returns the created todo with id, text, and completed

### Toggling
- toggleTodo flips completed from false to true or true to false
- toggling non-existent id does nothing (no error)

### Deleting
- deleteTodo removes the todo
- Returns true if deleted, false if id not found

### Filtering
- listCompleted returns only todos where completed is true
- listPending returns only todos where completed is false
- clearCompleted removes completed todos but keeps pending

## Pass Criteria

The generated code passes if:
1. `createTodoApp` function is exported
2. CRUD operations work correctly
3. Filtering returns correct subsets
4. Multiple instances don't share state
