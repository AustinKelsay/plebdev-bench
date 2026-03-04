# Evaluation Rubric: ttl-cache

Score the generated code from 1-10 based on the following criteria:

## Correctness (45%)
- Factory function `createTtlCache` is exported
- `set/get/has/delete/size/clear` behave correctly
- Expiration boundary semantics are correct (`>=` expires)
- `set` overwrite refreshes value and TTL

## Data Integrity (25%)
- Expired entries are not returned or counted
- Mutation methods produce consistent state transitions
- `delete` and `size` reflect true cache state

## Edge Cases (20%)
- Default TTL and per-entry TTL override both work
- `ttlMs = 0` immediate expiry is handled
- Boundary timestamps are deterministic
- `undefined` values can be stored without breaking `has/get`

## Code Quality (10%)
- Clear, maintainable TypeScript
- Predictable state handling
- Minimal unnecessary complexity

## Scoring Guide
- 9-10: Excellent - Correct TTL logic, boundaries, and mutation semantics
- 7-8: Good - Core behavior correct with minor edge-case issues
- 5-6: Acceptable - Basic cache works but expiration semantics are incomplete
- 3-4: Poor - Significant correctness bugs in expiry or state updates
- 1-2: Failing - Missing factory/API or broken cache behavior
