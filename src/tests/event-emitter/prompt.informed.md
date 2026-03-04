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
export function createEventEmitter(): EventEmitter

type Listener = (payload: unknown) => unknown

interface EventEmitter {
  on(event: string, listener: Listener): number
  once(event: string, listener: Listener): number
  off(event: string, listener: Listener): boolean
  emit(event: string, payload: unknown): unknown[]
  listenerCount(event: string): number
}
```

Behavior:
- `on` appends a listener and returns current listener count for that event
- `once` appends a one-time listener and returns current listener count
- Duplicate listener functions are allowed as separate registrations
- `off` removes one matching registration and returns `true` if removed, otherwise `false`
- `emit` invokes listeners in registration order and returns an array of their return values
- `once` listeners are removed after first invocation
- Event names are independent
- Must export `createEventEmitter` as a function (no classes as the primary exported API)
