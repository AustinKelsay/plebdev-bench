Purpose: Quick reference for the current codebase structure and key commands.

# Codebase Overview

Local-first CLI benchmark runner for local LLMs. Runs matrix of `runtimes × harnesses × models × tests × passTypes` and writes reproducible artifacts.

## Key Commands

```bash
bun pb                              # Run all (auto-discovers runtimes/harnesses/models/tests)
bun pb --models llama3.2:3b         # Limit to specific model
bun pb --tests smoke                # Limit to specific test
bun pb --pass-types blind           # Limit to blind pass only
bun pb --harnesses direct           # Limit to direct harness only
bun pb --runtimes ollama            # Limit to ollama runtime
bun run bench compare <runA> <runB>        # Compare two runs
bun run bench compare <runA> <runB> --json # Output raw JSON
bun test                            # Run test suite
bun run typecheck                   # Type check

# Dashboard
bun dashboard                       # Start dashboard dev server (localhost:5173)
bun dashboard:build                 # Build dashboard for production
bun dashboard:index                 # Generate results/index.json for dashboard
```

## Environment Variables

- `OPENROUTER_API_KEY` - Enables frontier eval via OpenRouter (GPT-5.2)

## Module Layout

```
src/
├── index.ts              # CLI entrypoint
├── cli/
│   ├── index.ts          # Commander program
│   ├── run-command.ts    # `bench run` implementation
│   └── compare-command.ts # Compare command
├── schemas/              # Zod schemas (source of truth)
│   ├── common.schema.ts  # SCHEMA_VERSION, PassType, RuntimeName
│   ├── config.schema.ts  # BenchConfig
│   ├── plan.schema.ts    # RunPlan, MatrixItem
│   └── result.schema.ts  # RunResult, MatrixItemResult
├── runtimes/             # Runtime adapters (inference backends)
│   ├── runtime.ts        # Runtime interface + types
│   ├── ollama-runtime.ts # Ollama HTTP implementation
│   ├── discovery.ts      # Detect available runtimes
│   └── index.ts          # Factory + exports
├── harnesses/            # Harness adapters (interface layer)
│   ├── harness.ts        # Common interface
│   ├── direct-adapter.ts # Direct HTTP to runtime (was ollama-adapter)
│   ├── goose-adapter.ts  # CLI via Goose (headless mode)
│   ├── opencode-adapter.ts # CLI via OpenCode (direct mode)
│   ├── opencode-server.ts  # OpenCode server lifecycle (deprecated, kept for reference)
│   ├── tool-prompt.ts    # Tool-calling prompt builder
│   ├── discovery.ts      # Detect available harnesses
│   └── index.ts          # Factory + exports
├── lib/
│   ├── logger.ts         # Pino logger
│   ├── run-id.ts         # ID generator
│   ├── timeout.ts        # Dynamic timeout calculation
│   ├── code-extractor.ts # Extract code from LLM markdown output
│   ├── scorer.ts         # Run automated scoring via dynamic import
│   ├── scoring-spec.ts   # Scoring spec types + loader
│   ├── openrouter-client.ts # Frontier eval via OpenRouter API
│   ├── stats.ts          # Run statistics calculation + formatting
│   ├── failure-classifier.ts # Classify generation/scoring errors
│   └── tool-smoke.ts     # Tool-smoke test generation + scoring
├── runner/
│   ├── index.ts          # Orchestration
│   ├── plan-builder.ts   # Discovery + matrix expansion
│   └── item-executor.ts  # Single item execution
├── results/
│   ├── writer.ts         # Write plan.json + run.json
│   ├── reader.ts         # Read run results
│   └── compare.ts        # Compare two runs + delta computation
└── tests/
    ├── smoke/            # Basic add() function
    ├── calculator-basic/ # Stateless arithmetic functions
    ├── calculator-stateful/ # Calculator with memory
    ├── todo-app/         # CRUD todo manager
    └── tool-smoke/       # Tool-calling preflight test
```

## Architecture: Runtimes vs Harnesses

The architecture separates **runtimes** (inference backends) from **harnesses** (interface adapters):

- **Runtime**: An inference backend that provides models (e.g., Ollama). Runtimes handle model discovery, health checks, and metadata.
- **Harness**: An interface adapter that sends prompts to a runtime (e.g., direct HTTP, Goose CLI, OpenCode CLI).

### Runtimes

| Runtime | Method | Description |
|---------|--------|-------------|
| `ollama` | HTTP | Local Ollama server at configured URL |

Discovery: `discoverRuntimes()` checks if Ollama endpoint is reachable.

### Harnesses

All harnesses use a Runtime for the actual inference:

| Harness | Method | Description |
|---------|--------|-------------|
| `direct` | HTTP | Direct API calls to runtime (was "ollama" harness) |
| `goose` | CLI | Headless mode with `--provider ollama --model` CLI flags |
| `opencode` | CLI | Direct mode with `opencode run` (tool-calling) |

Discovery: `discoverHarnesses()` checks CLI availability. The `direct` harness is always available.

**Robustness**: All adapters validate output (fail-fast on empty/short responses) and log debug info + stderr.

### Goose Headless Mode
```bash
goose run --no-session --provider ollama --model <model> -q --output-format json -i -
# Prompt piped via stdin
```
- `--provider ollama` and `--model` CLI flags **override config file** (critical)
- `--output-format json` for structured output
- Prompt passed via stdin (`-i -`) to avoid shell escaping issues
- `cwd: /tmp` to prevent codebase scanning

### OpenCode Direct Mode
```bash
# Direct execution with tool-calling
opencode run "<prompt>" --model ollama/<model> --agent build --format json
```
- Runs directly in a temporary work directory (no server mode)
- Uses `edit` or `write` tool to create `solution.ts`
- Local `opencode.json` config enables tools and sets permissions
- Code read from file after execution (tool-calling mode)
- Falls back to tool call extraction from JSON output if needed
- **Tool-smoke preflight**: Runs tool-smoke test first to verify tool support

## Result Artifacts

Each run creates `results/<run-id>/`:
- `plan.json` - Expanded matrix plan (for reproducibility)
- `run.json` - Execution results with per-item details

## Schemas

Schema version: `0.2.0`

| Schema | File | Purpose |
|--------|------|---------|
| `RuntimeNameSchema` | common.schema.ts | Valid runtime names ("ollama") |
| `BenchConfig` | config.schema.ts | CLI input, defaults |
| `RunPlan` | plan.schema.ts | Expanded matrix (plan.json) |
| `RunResult` | result.schema.ts | Execution output (run.json) |
| `MatrixItem` | plan.schema.ts | Single matrix entry (includes runtime) |
| `MatrixItemResult` | result.schema.ts | Item + generation result + scores |
| `ScoringSpec` | scoring.schema.ts | Data-driven test definitions |
| `AutomatedScore` | result.schema.ts | Passed/failed/total counts |
| `FrontierEval` | result.schema.ts | GPT-5.2 score + reasoning |
| `GenerationFailureType` | common.schema.ts | 6 types: timeout, api_error, tool_missing, harness_error, prompt_not_found, unknown |
| `ScoringFailureType` | common.schema.ts | 7 types: extraction, import, export_validation, test_execution, spec_load, no_spec, unknown |
| `FrontierEvalFailureType` | common.schema.ts | 8 types: timeout, auth_error, rate_limited, http_error, invalid_response, parse_error, truncated, unknown |

## Key Behaviors

- **Auto-discovery**: By default, discovers all runtimes available, all models from runtimes, all harnesses available, and all tests in `src/tests/`
- **Limiting flags**: Use `--models`, `--harnesses`, `--tests` to limit which items to run
- **Sequential execution**: One item at a time
- **Dynamic timeouts**: Timeout scales with model size and harness:
  - Base: 60s + ceil(params/10) * 60s
  - Harness overhead: Goose +60s, OpenCode +60s + (params/10 * 30s)
  - High-precision multiplier: 5x for bf16/fp16/f32 models
  - Large model overhead: +300s for >20B params
  - Floor: 60s, Ceiling: 20 min
- **Smart model unloading**: Model stays loaded for consecutive same-model items (Ollama)
- **Fail-fast validation**: Empty or very short output throws error immediately (catches silent failures)
- **Stderr fallback**: If stdout is empty but stderr has meaningful content, uses stderr as output
- **Model recognition errors**: Fast empty responses (<2s) indicate model not recognized by OpenCode (check config)
- **Tool-smoke preflight**: If `tool-smoke` is present, it runs first per model/harness; failures skip remaining items for that model/harness as tool failures
- **Failure handling**: Item failures recorded, don't crash run, exit 0
- **Failure categorization**: Errors classified as generation failures (timeout, api_error, harness_error, prompt_not_found) or scoring failures (extraction, import, export_validation, test_execution, spec_load, no_spec)
- **Frontier eval failures**: Recorded per-item in `frontierEvalFailure` with type/message/status when OpenRouter calls fail
- **Debug logging**: Harness adapters log command execution and stderr for troubleshooting
- **Progress output**: `item 01/08: runtime=ollama harness=direct model=X test=Y pass=blind timeout=5m`

## Defaults

```typescript
{
  runtimes: []                // Auto-discover all available
  models: []                  // Auto-discover all from runtimes
  harnesses: []               // Auto-discover all available
  tests: []                   // Auto-discover all from src/tests/
  passTypes: ["blind", "informed"]
  ollamaBaseUrl: "http://localhost:11434"
  generateTimeoutMs: 300_000  // 5 minutes (for large models)
  outputDir: "results"
}
```

## Dashboard (`apps/dashboard/`)

React-based visual dashboard for browsing and comparing benchmark results.

```
apps/dashboard/src/
├── components/
│   ├── ui/                    # shadcn/ui components (badge, button, card, dialog, select, skeleton, table, tabs, info-tooltip)
│   ├── layout/                # Header, page containers
│   ├── run-list/              # Run list view (run-card, run-list-page)
│   ├── run-detail/            # Run detail view (9 components)
│   │   ├── run-detail-page.tsx
│   │   ├── matrix-table.tsx
│   │   ├── status-badge.tsx
│   │   ├── scoring-breakdown.tsx
│   │   ├── timing-stats.tsx
│   │   ├── item-detail-dialog.tsx
│   │   ├── dimension-detail-dialog.tsx
│   │   ├── failure-breakdown.tsx
│   │   └── tooling-breakdown.tsx
│   ├── compare/               # Compare view (5 components)
│   │   ├── compare-page.tsx
│   │   ├── compare-summary.tsx
│   │   ├── compare-table.tsx
│   │   ├── delta-badge.tsx
│   │   └── run-selector.tsx
│   └── charts/                # Recharts visualizations (5 charts)
│       ├── composite-score-chart.tsx   # Effective score + pass rate + tool success
│       ├── blind-vs-informed-chart.tsx # Paired bar comparison
│       ├── pass-rate-chart.tsx         # Pass rate by dimension
│       ├── timing-distribution.tsx     # Histogram with p50/p90
│       └── frontier-eval-scatter.tsx   # Pass rate vs frontier score
├── hooks/                     # Data fetching hooks
├── lib/                       # Types, API, aggregations
│   ├── types.ts               # TypeScript types
│   ├── api.ts                 # Data fetching
│   ├── aggregations.ts        # Statistics computation
│   └── tooltip-content.ts     # Chart tooltip helpers
└── pages/                     # Route components
```

**Features:**
- Run list with summary cards
- Run detail with matrix table, scoring breakdown, timing stats
- Compare view with delta badges and tabbed tables
- Drill-down dialogs for items and dimensions
- Failure and tooling breakdown panels

**Charts:**
- **CompositeScoreChart**: Multi-bar showing effective score (gold), pass rate (green), tool success (blue), frontier (purple)
- **BlindVsInformedChart**: Paired bars comparing blind (amber) vs informed (green) pass rates
- **PassRateChart**: Pass rate by dimension (model/harness/test)
- **TimingDistribution**: Histogram with p50/p90 markers
- **FrontierEvalScatter**: Scatter plot of pass rate vs frontier score

**Aggregation Functions** (`apps/dashboard/src/lib/aggregations.ts`):
- `computePassRate(items)` - Calculate overall pass rate
- `computeCompositeMetrics(items, groupFn)` - Effective score with weights
- `computeBlindInformedBreakdown(items, groupFn)` - Blind vs informed delta
- `computeFailureStats(items)` - Failure counts by type
- `computeToolScoreBreakdown(items, groupFn)` - Tool usage vs scoring
- `inferToolHarnesses(items)` - Detect tool-calling harnesses
- `partitionToolSmoke(items)` - Separate tool-smoke from regular items
- `compareRuns(runA, runB)` - Full comparison with deltas

**Effective Score Formula:**
```
effectiveScore = passRate × 0.4 + completionRate × 0.3 + toolSuccessRate × 0.3
```

**Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts

### Tool-Calling Harnesses

Tool-calling harnesses (Goose, OpenCode) use `buildToolPrompt()` to wrap task prompts:
- `TOOL_CALLING_HARNESS_NAMES = ["goose", "opencode"]`
- Tool success tracked via `tool_missing` failure type
- Tool-smoke test runs first per model/harness to verify tool support

## Current Status

- Setup phase: Complete (multi-harness support added)
- MVP phase: Complete (scoring, frontier eval, compare, enhanced stats)
- Scale & Polish phase: Complete (dashboard frontend, harness optimizations, tool-smoke tests)
