Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export a factory `createEventEmitter` for a minimal event system with listener registration/removal.

Requirements:
- Return an object with `on(event, listener)`, `once(event, listener)`, `off(event, listener)`, `emit(event, payload)`, and `listenerCount(event)`.
- `on` and `once` return the current listener count for that event.
- `off` returns `true` when one matching listener is removed, otherwise `false`.
- `listenerCount` returns the current listener count for that event.
- Support normal listeners and one-time listeners.
- Listeners should fire in registration order.
- Duplicate listener registration should be supported.
- `off` should remove one matching listener.
- `emit` should return listener return values in call order.
- Event names should be isolated from one another.
- Must export `createEventEmitter` as a function (no classes as the primary exported API).
