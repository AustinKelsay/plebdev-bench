Output only TypeScript code for a single module. No explanations or tool/file usage.
The harness imports your output and calls the exported functions directly.

Export:
```ts
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

Behavior:
- `addTodo(text)` returns `{ id, text, completed: false }` with auto-incrementing `id`
- IDs are never reused after deletion
- `clearCompleted()` removes only completed todos
- List methods return arrays of todos
Must export `createTodoApp` (no classes).
