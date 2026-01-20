Output only TypeScript code for a single module. No explanations or tool/file usage.
The harness imports your output and calls the exported functions directly.

Export a factory `createTodoApp()` that returns an object with:
- `addTodo`, `getTodo`, `toggleTodo`, `deleteTodo`
- `listTodos`, `listCompleted`, `listPending`, `clearCompleted`

Todos are `{ id: number, text: string, completed: boolean }` with auto-incrementing IDs.
IDs are never reused after deletion. `clearCompleted` removes only completed todos.
Must export `createTodoApp` (no classes).
