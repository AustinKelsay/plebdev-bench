# event-emitter

Minimal event emitter with listener management semantics.

## Output Contract

The generated answer must be a single TypeScript module suitable for direct import by the harness:

- Return code only (no prose, no examples, no `console.log`)
- Export `createEventEmitter` as the primary API function
- Do not use a class as the primary exported API

## Requirements

Generate TypeScript code that exports a `createEventEmitter` factory function.

`createEventEmitter()` must return an object with:

- `on(event: string, listener: (payload: unknown) => unknown): number`
- `once(event: string, listener: (payload: unknown) => unknown): number`
- `off(event: string, listener: (payload: unknown) => unknown): boolean`
- `emit(event: string, payload: unknown): unknown[]`
- `listenerCount(event: string): number`

## Acceptance Criteria

### Listener Semantics
- Listeners fire in registration order
- Duplicate listener registrations are allowed
- `off` removes one matching listener registration
- `once` listener fires at most once

### Event Isolation
- Each event name has isolated listener lists
- Emitting one event does not trigger listeners for another

### Return Values
- `on` and `once` return listener count after registration
- `off` returns whether a listener was removed
- `emit` returns an array of listener return values in call order
- `listenerCount` returns current count for the event

## Pass Criteria

The generated code passes if:
1. `createEventEmitter` function is exported
2. Registration/removal semantics are correct
3. `once` listeners are handled correctly
4. Emit ordering and per-event isolation are correct
