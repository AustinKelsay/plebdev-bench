# Tool Smoke Test

A minimal tool-calling preflight to verify a harness can write files via tools.

## Output Contract

The generated answer must be a single TypeScript module suitable for direct import by the harness:

- Return code only (no prose, no examples, no `console.log`)
- Export a top-level named `add` function

## Task

Write a TypeScript function called `add` that takes two numbers and returns their sum.

## Pass Criteria

- Function is named `add`
- Takes two numeric parameters
- Returns the sum of the two numbers
- Uses TypeScript syntax

## Notes

This test runs once per model/harness (using one pass type) before other tests for that pair.
If it fails with tool-missing behavior, remaining items for that model/harness are skipped.
