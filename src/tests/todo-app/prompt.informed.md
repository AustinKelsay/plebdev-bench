Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

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
- `addTodo` returns a `Todo` object (not just the id)
- `deleteTodo` returns `true` when deleted, otherwise `false`
- `toggleTodo` on a missing id does nothing and must not throw
Must export `createTodoApp` as a function (no classes as the primary exported API).
