# Tool Smoke Test

A minimal tool-calling preflight to verify a harness can write files via tools.

## Task

Write a TypeScript function called `add` that takes two numbers and returns their sum.

## Pass Criteria

- Function is named `add`
- Takes two numeric parameters
- Returns the sum of the two numbers
- Uses TypeScript syntax

## Notes

This test is intended to run before other tests for each model/harness. If it fails
because tool calls are missing, the remaining items for that model/harness are skipped.
