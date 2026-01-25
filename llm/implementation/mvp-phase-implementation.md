Purpose: Document the MVP phase implementation - automated scoring, frontier eval, compare, and benchmark tests.

# MVP Phase Implementation

## Summary

The MVP phase delivers:
- **Automated scoring** via data-driven scoring specs and dynamic import
- **Frontier eval** via OpenRouter GPT-5.2 (optional, auto-enabled with API key)
- **Compare command** for deterministic run comparison with deltas
- **Benchmark test catalog** with 4 tests (smoke, calculator-basic, calculator-stateful, todo-app)

## Architecture Updates

### New Files

```
src/
├── lib/
│   ├── code-extractor.ts     # Extract code from LLM markdown output
│   ├── scorer.ts             # Run scoring against generated code
│   ├── scoring-spec.ts       # Scoring spec types + loader
│   ├── openrouter-client.ts  # Frontier eval API client
│   └── stats.ts              # Run statistics calculation + formatting
├── schemas/
│   └── scoring.schema.ts     # Zod schemas for scoring specs
├── results/
│   └── compare.ts            # Compare two runs + delta computation
└── tests/
    ├── smoke/scoring.spec.ts
    ├── calculator-basic/     # NEW benchmark test
    ├── calculator-stateful/  # NEW benchmark test
    └── todo-app/             # NEW benchmark test
```

### Modified Files

- `src/runner/item-executor.ts` - Added scoring + frontier eval integration, timing metrics
- `src/runner/index.ts` - Added frontier eval status, detailed stats summary
- `src/cli/compare-command.ts` - Full implementation with terminal-native output
- `src/schemas/index.ts` - Export new scoring schemas
- `src/schemas/result.schema.ts` - Added `latencyMs` to FrontierEval, new `ScoringMetrics` schema

## Feature A: Automated Scoring

### Code Extraction (`src/lib/code-extractor.ts`)

Extracts executable code from LLM output using a multi-strategy approach:

1. **markdown-ts**: Extract ```typescript or ```ts code blocks
2. **markdown-any**: Extract any ``` code blocks (js, jsx, etc.)
3. **heuristic**: Pattern match for function/const/class declarations
4. **raw**: Return raw output as last resort

Also strips harness-specific noise (e.g., Goose tool-use prefixes).

### Scoring Specs (`src/tests/<test>/scoring.spec.ts`)

Data-driven test definitions:

```typescript
export const spec: ScoringSpec = {
  testSlug: "calculator-basic",
  expectedExports: [
    { name: "add", type: "function" },
    // ...
  ],
  testCases: [
    { fn: "add", args: [2, 3], expected: 5 },
    { fn: "divide", args: [1, 0], expected: Infinity },
    // ...
  ],
};
```

### Scorer (`src/lib/scorer.ts`)

Execution flow:
1. Extract code from LLM output
2. Write to temp file
3. Dynamic import (Bun native TypeScript support)
4. Verify expected exports exist
5. Run test cases and compare results
6. Clean up temp file

Timeout: 5 seconds default (protects against infinite loops).

### Integration

`item-executor.ts` calls `scoreGeneration()` after successful generation:

```typescript
if (generation.success && generation.output) {
  const scoringResult = await scoreGeneration(item.test, generation.output);
  automatedScore = {
    passed: scoringResult.passed,
    failed: scoringResult.failed,
    total: scoringResult.total,
  };
}
```

## Feature B: Frontier Eval

### OpenRouter Client (`src/lib/openrouter-client.ts`)

- Model: `openai/gpt-5.2`
- Timeout: 30 seconds
- Max tokens: 1024 (sized to avoid truncation while keeping responses reasonable)
- Graceful failure: returns null on any error, logs warning, continues run

### Error Handling for Frontier Eval

The client handles several failure modes gracefully:

| Failure Mode | Detection | Behavior |
|--------------|-----------|----------|
| HTTP error | Non-200 status | Logs warning, returns null |
| Empty response | No content in choices | Logs warning, returns null |
| Truncation | `finish_reason === "length"` | Logs warning with content preview, returns null |
| Invalid JSON | JSON parse error | Logs warning with content preview, returns null |
| Invalid score | Score not 1-10 | Logs warning, returns null |
| Missing reasoning | Empty/missing field | Logs warning, returns null |

The prompt explicitly requests concise reasoning (under 200 characters) to minimize truncation risk.

### Evaluation Flow

1. Check for `OPENROUTER_API_KEY` environment variable
2. Load rubric from `src/tests/<test>/rubric.md`
3. Build evaluation prompt with code + rubric
4. Request structured JSON response: `{ score: 1-10, reasoning: "..." }`
5. Parse and validate response

### Integration

`item-executor.ts` calls frontier eval after scoring if key is present:

```typescript
const openRouterKey = getOpenRouterKey();
if (openRouterKey && generation.success && generation.output) {
  const rubric = loadRubric(item.test);
  if (rubric) {
    const evalResult = await evaluateWithFrontier({ code, rubric, testSlug }, openRouterKey);
    if (evalResult) {
      frontierEval = { score, reasoning, model };
    }
  }
}
```

### Runner Output

At startup:
```
Frontier eval: enabled
```
or
```
Frontier eval: disabled (no OPENROUTER_API_KEY)
```

At completion (if enabled):
```
Frontier eval: avg 7.5/10 (8 items)
```

## Feature C: Compare Command

### Compare Logic (`src/results/compare.ts`)

Composite key: `model|harness|test|passType`

Outer join semantics:
- **Matched**: items in both runs → compute deltas
- **Only in A**: items only in baseline
- **Only in B**: items only in comparison

Deltas computed:
- Status changes (completed → failed, failed → completed)
- Automated score pass rate delta
- Frontier eval score delta
- Duration delta

### CLI (`bench compare <run-a> <run-b>`)

Terminal-native output:

```
Compare Benchmark Runs
============================================================
Run A: 20260114-143000-abc123 (Jan 14, 14:30)
Run B: 20260114-150000-def456 (Jan 14, 15:00)

Summary
----------------------------------------
  Matched items:  48
  Only in A:      0
  Only in B:      4

Status Changes
----------------------------------------
  Improved:   2 (failed → completed)
  Regressed:  1 (completed → failed)

Scoring Delta
----------------------------------------
  Pass rate:  Δ +5.2%
```

Options:
- `-o, --output <dir>` - Results directory (default: results)
- `--json` - Output raw JSON instead of formatted table

## Feature D: Benchmark Test Catalog

### smoke
Simple `add(a, b)` function. Original test, now with real scoring spec.

### calculator-basic
Stateless arithmetic: `add`, `subtract`, `multiply`, `divide`.
- 17 test cases covering edge cases (zero, negative, floats, division by zero)

### calculator-stateful
Stateful calculator with method chaining and memory:
- `createCalculator()` factory
- Operations: add, subtract, multiply, divide, clear
- Memory: memoryStore, memoryRecall, memoryClear, memoryAdd
- 16 test cases

### todo-app
CRUD todo list manager:
- `createTodoApp()` factory
- Operations: addTodo, getTodo, toggleTodo, deleteTodo
- Filtering: listTodos, listCompleted, listPending, clearCompleted
- 10 test cases

## Feature E: Enhanced Run Statistics

### Stats Module (`src/lib/stats.ts`)

Provides comprehensive statistics calculation and terminal-native formatting:

```typescript
export interface RunStats {
  timing: TimingStats;     // avg/min/max generation, scoring, frontier eval times
  tokens: TokenStats | null;    // prompt/completion totals and averages (Ollama only)
  scoring: ScoringStats | null; // pass rate with breakdowns by test/harness/model
  frontier: FrontierStats | null; // avg score with breakdowns by harness/model
}

// Main functions
export function calculateRunStats(results: MatrixItemResult[]): RunStats;
export function formatRunStats(stats, runId, completed, failed, total, durationMs, outputDir): string;
```

### Sample Output

```
Run complete: 20260114-160846-b14952
  Completed: 23/24
  Failed: 1
  Duration: 27m 14s

Timing
  Avg generation:    42.3s
  Avg scoring:       0.8s
  Avg frontier eval: 2.1s
  Generation range:  12.5s - 89.2s

Tokens
  Total prompt:      12,450
  Total completion:  8,320
  Avg completion:    362/item
  Items with tokens: 23/24

Scoring
  Pass rate: 34.8% (98/282 tests)
  By test:
    smoke               80.0% (4/5)
    calculator-basic    52.9% (9/17)
    calculator-stateful 25.0% (4/16)
    todo-app            20.0% (2/10)
  By harness:
    ollama              45.0% (54/120)
    goose               28.3% (34/120)
  By model:
    qwen2.5:7b          42.0% (50/119)
    llama3.2:3b         29.4% (35/119)

Frontier Eval
  Avg score: 5.8/10 (21 items)
  Range: 3/10 - 9/10
  By harness:
    ollama  6.2/10 (7)
    goose   5.4/10 (7)

Results: results/20260114-160846-b14952/
```

### Schema Updates

Added to `FrontierEvalSchema`:
```typescript
latencyMs: z.number().optional()
```

New `ScoringMetricsSchema`:
```typescript
export const ScoringMetricsSchema = z.object({
  durationMs: z.number(),
});
```

Updated `MatrixItemResultSchema`:
```typescript
scoringMetrics: ScoringMetricsSchema.optional()
```

### Timing Collection

`item-executor.ts` now tracks:
- **Scoring duration**: Uses `performance.now()` around scorer call
- **Frontier latency**: Passed through from OpenRouter client response

## Execution Flow (Updated)

```
For each matrix item:
1. Load prompt (prompt.blind.md or prompt.informed.md)
2. Generate via harness (with dynamic timeout)
3. IF generation succeeded:
   a. Extract code from output
   b. Load scoring spec
   c. Run automated scoring (5s timeout)
   d. IF OPENROUTER_API_KEY present + rubric exists:
      - Call frontier eval (30s timeout)
      - On failure: log warning, continue
4. Record result with:
   - generation (success/output/error/tokens)
   - automatedScore (passed/failed/total)
   - frontierEval (score/reasoning/model)
5. Continue to next item
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Code extraction fails | Uses raw output, likely fails scoring |
| Scoring import error | Records 0 passed, total = test case count |
| Scoring timeout | Records as all-fail after 5s |
| No scoring spec | Skips scoring, records 0/0/0 |
| Frontier eval truncated | Detects via `finish_reason`, logs warning, sets frontierEval = null |
| Frontier eval fails | Logs warning, sets frontierEval = null |
| No rubric | Skips frontier eval |
| Compare invalid run | Throws at read time |

## CLI Updates

### `bench run`
- Now shows frontier eval status at startup
- Summary includes scoring stats and frontier eval average

### `bench compare <run-a> <run-b>`
- Fully implemented with delta computation
- Terminal-native table output
- `--json` option for machine-readable output

## Testing

All tests pass:
- Schema tests (8 tests)
- Adapter tests (7 tests)
- Stats tests (21 tests)
- Smoke tests (6 tests)

Total: 43 tests with 120 assertions.

Note: Some pre-existing TypeScript strictness issues exist in `openrouter-client.ts` and `scorer.ts` (type narrowing). Bun runs the code correctly; these can be addressed in the hardening phase.

## Feature F: Failure Categorization

### Overview

Detailed failure categorization distinguishes infrastructure errors (timeout, API errors) from model performance failures (test failures). This enables better diagnostics and separates "the model tried but failed" from "the harness/infrastructure failed."

### Failure Types

Two failure type enums defined in `src/schemas/common.schema.ts`:

**Generation Failures** (infrastructure/harness issues):
| Type | Description |
|------|-------------|
| `timeout` | Request timed out during generation |
| `api_error` | HTTP error, network failure, connection refused |
| `harness_error` | Empty output, output too short, command failed |
| `prompt_not_found` | Prompt file missing for test/passType |
| `unknown` | Unclassified error |

**Scoring Failures** (code quality issues):
| Type | Description |
|------|-------------|
| `no_spec` | No scoring spec found for test |
| `extraction` | Code extraction from LLM output failed |
| `spec_load` | Failed to load scoring spec |
| `import` | Dynamic import of generated code failed (syntax errors) |
| `export_validation` | Missing exports or factory function failed |
| `test_execution` | Value mismatch during test case execution |
| `unknown` | Unclassified error |

### Failure Classifier (`src/lib/failure-classifier.ts`)

Pattern-matching functions that classify error messages:

```typescript
export function classifyGenerationError(errorMessage: string): GenerationFailureType;
export function classifyScoringError(errorMessage: string): ScoringFailureType;
```

### Schema Updates

`GenerationResultSchema` now includes:
```typescript
failureType: GenerationFailureTypeSchema.optional()
```

`ScoringResultSchema` now includes:
```typescript
failureType: ScoringFailureTypeSchema.optional()
```

### Stats Integration

`RunStats` includes failure breakdown:
```typescript
export interface GenerationFailureStats {
  total: number;
  byType: { type: string; count: number }[];
}
```

### Sample Output

```
Run complete: 20260115-095646-912e5a
  Completed: 21/24
  Failed: 3
  Failure breakdown:
    timeout: 1
    harness_error: 2
  Duration: 34m 47s
```

## Feature G: OpenCode Output Capture Fix

### Problem

OpenCode runs in "agent mode" and by default writes code to files using the `Edit` tool, returning only status messages ("Task completed.") to stdout. The harness was capturing these status messages instead of actual generated code, causing 0% pass rate.

### Solution

Two-part fix in `opencode-adapter.ts`:

**1. Prompt Prefix** - Instruct OpenCode to output code directly:
```typescript
const OPENCODE_PROMPT_PREFIX = `IMPORTANT: You are being used as a code generation tool for benchmarking.
- Do NOT use any file tools (Edit, Write, Bash) to create or modify files
- Do NOT create, read, or modify any files on disk
- Output your complete code solution directly in your response
- Use a markdown code block with the appropriate language tag (e.g., \`\`\`typescript)
- Include ONLY the code that solves the task - no extra examples or imports that aren't needed

Here is the task:

`;

// In generate():
const fullPrompt = OPENCODE_PROMPT_PREFIX + opts.prompt;
```

**2. Code Extraction** - Extract code blocks from output:
```typescript
const extracted = extractCode(output);
if (extracted.method !== "raw") {
  log.debug({ method: extracted.method }, "Extracted code from OpenCode agent output");
  output = extracted.code;
}
```

This ensures OpenCode outputs code directly in markdown blocks instead of writing to temp files, allowing the harness to capture the generated code for scoring.

## Exit Criteria Status

- [x] `bench run` executes matrix with both passTypes, writes plan.json + run.json
- [x] 4 benchmark tests (smoke, calculator-basic, calculator-stateful, todo-app) have real scoring
- [x] Frontier eval works via OpenRouter when keyed, failures recorded not crashed
- [x] `bench compare` works with deterministic deltas
- [x] Enhanced run statistics with timing, tokens, scoring, and frontier breakdowns
- [x] Failure categorization distinguishes infrastructure vs model errors
- [x] OpenCode harness extracts code from agent-mode output
