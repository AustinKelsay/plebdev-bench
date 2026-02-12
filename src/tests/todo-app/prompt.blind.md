Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Export a factory `createTodoApp()` that returns an object with:
- `addTodo(text: string): { id: number, text: string, completed: boolean }`
- `getTodo(id: number): { id: number, text: string, completed: boolean } | undefined`
- `toggleTodo(id: number): void`
- `deleteTodo(id: number): boolean`
- `listTodos`, `listCompleted`, `listPending`, `clearCompleted`
- `listTodos(): Array<{ id: number, text: string, completed: boolean }>`
- `listCompleted(): Array<{ id: number, text: string, completed: boolean }>`
- `listPending(): Array<{ id: number, text: string, completed: boolean }>`
- `clearCompleted(): void`

Todos are `{ id: number, text: string, completed: boolean }` with auto-incrementing IDs.
IDs are never reused after deletion. `clearCompleted` removes only completed todos.
Must export `createTodoApp` (no classes).
