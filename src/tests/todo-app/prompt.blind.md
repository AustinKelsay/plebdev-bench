Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export a factory `createTodoApp()` that returns an object with:
- `addTodo(text: string): { id: number, text: string, completed: boolean }`
- `getTodo(id: number): { id: number, text: string, completed: boolean } | undefined`
- `toggleTodo(id: number): void`
- `deleteTodo(id: number): boolean`
- `listTodos(): Array<{ id: number, text: string, completed: boolean }>`
- `listCompleted(): Array<{ id: number, text: string, completed: boolean }>`
- `listPending(): Array<{ id: number, text: string, completed: boolean }>`
- `clearCompleted(): void`

Todos are `{ id: number, text: string, completed: boolean }` with auto-incrementing IDs.
IDs are never reused after deletion. `clearCompleted` removes only completed todos.
`addTodo` must return the full created todo object (not just the id).
`deleteTodo` returns `true` when a todo is deleted, otherwise `false`.
`toggleTodo` for a missing id should do nothing and must not throw.
Must export `createTodoApp` as a function (no classes as the primary exported API).
