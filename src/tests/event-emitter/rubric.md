# Evaluation Rubric: event-emitter

Score the generated code from 1-10 based on the following criteria:

## Correctness (45%)
- Factory function `createEventEmitter` is exported
- `on/once/off/emit/listenerCount` behave as specified
- Listeners execute in registration order
- `once` listeners run only once
- `off` removes one matching registration

## Stateful Behavior (25%)
- Event listener state is isolated per event name
- Duplicate listener registrations are handled correctly
- State transitions after emit/removal are consistent

## Edge Cases (20%)
- Removing non-existent listener returns false
- Emitting unknown event returns empty result
- Listener counts stay accurate after mixed operations

## Code Quality (10%)
- Clean TypeScript API
- Clear internal data structure usage
- Minimal unnecessary complexity

## Scoring Guide
- 9-10: Excellent - Full API correctness with stable listener semantics
- 7-8: Good - Core functionality correct with minor edge-case issues
- 5-6: Acceptable - Basic events work but once/removal/count behavior has gaps
- 3-4: Poor - Significant logic bugs in listener lifecycle
- 1-2: Failing - Missing factory/API or fundamentally broken emitter behavior
