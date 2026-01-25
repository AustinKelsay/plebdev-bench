Build a todo list manager in TypeScript.

## Requirements

Export a `createTodoApp` factory function:

```typescript
export function createTodoApp(): TodoApp

interface Todo {
  id: number
  text: string
  completed: boolean
}

interface TodoApp {
  addTodo(text: string): Todo
  getTodo(id: number): Todo | undefined
  toggleTodo(id: number): void
  deleteTodo(id: number): boolean
  listTodos(): Todo[]
  listCompleted(): Todo[]
  listPending(): Todo[]
  clearCompleted(): void
}
```

## Behavior

- `addTodo(text)` creates todo with auto-incrementing id, completed=false
- `getTodo(id)` returns todo or undefined
- `toggleTodo(id)` flips completed status
- `deleteTodo(id)` removes todo, returns true if found
- `listTodos()` returns all todos
- `listCompleted()` returns todos where completed=true
- `listPending()` returns todos where completed=false
- `clearCompleted()` removes all completed todos

## Critical Requirements (Common Mistakes)

⚠️ **Pay special attention to these requirements:**

- `clearCompleted()` must ONLY remove completed todos, not all todos
- List methods must return COPIES of todo objects (use spread or JSON clone), not direct references that allow external mutation
- ID generation must use a separate counter variable, NOT `todos.length + 1` (IDs break after deletions otherwise)
- `deleteTodo()` must return a boolean (true if deleted, false if not found), not void

## Example Usage

```typescript
const app = createTodoApp()

const todo1 = app.addTodo("Buy milk")    // { id: 1, text: "Buy milk", completed: false }
const todo2 = app.addTodo("Walk dog")    // { id: 2, text: "Walk dog", completed: false }

app.toggleTodo(1)                        // todo1 now completed: true
app.listCompleted()                      // [{ id: 1, text: "Buy milk", completed: true }]
app.listPending()                        // [{ id: 2, text: "Walk dog", completed: false }]

app.deleteTodo(2)                        // true
app.listTodos()                          // [{ id: 1, text: "Buy milk", completed: true }]

app.clearCompleted()
app.listTodos()                          // []
```
