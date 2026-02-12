# Smoke Test

A simple benchmark test to verify the pipeline works end-to-end.

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

## Scoring

- Automated scoring validates exports and executes functional test cases.
- Frontier eval applies `rubric.md` via OpenRouter when `OPENROUTER_API_KEY` is configured.
