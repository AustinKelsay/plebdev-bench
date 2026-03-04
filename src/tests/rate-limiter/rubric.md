# Evaluation Rubric: rate-limiter

Score the generated code from 1-10 based on the following criteria:

## Correctness (45%)
- Factory function `createRateLimiter` is exported
- Quota is enforced correctly per key
- Window boundary semantics are correct (`>=` reset)
- `remaining` reflects current state accurately
- `reset` clears only target key

## Stateful Design (25%)
- Key state is isolated and deterministic
- No cross-key leakage
- No reliance on wall clock (`Date.now`) in core behavior

## Edge Cases (20%)
- Boundary timestamps behave correctly
- Rejected calls do not produce negative quota
- Fixed policy configuration is applied consistently

## Code Quality (10%)
- Clear and concise TypeScript
- Predictable, maintainable logic
- Minimal unnecessary complexity

## Scoring Guide
- 9-10: Excellent - Correct quotas, boundaries, and key isolation with clean implementation
- 7-8: Good - Core behavior correct with minor edge-case or API issues
- 5-6: Acceptable - Basic limiting works but boundary/reset behavior has gaps
- 3-4: Poor - Significant correctness bugs in window/quota handling
- 1-2: Failing - Missing factory/API or fundamentally broken state logic
