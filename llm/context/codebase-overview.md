Purpose: Quick reference for the current codebase structure and key commands.

# Codebase Overview

Local-first CLI benchmark runner for local LLMs. Runs matrix of `models × harnesses × tests × passTypes` and writes reproducible artifacts.

## Key Commands

```bash
bun pb                              # Run all (auto-discovers models/harnesses/tests)
bun pb --models llama3.2:3b         # Limit to specific model
bun pb --tests smoke                # Limit to specific test
bun pb --pass-types blind           # Limit to blind pass only
bun pb --harnesses ollama           # Limit to ollama harness only
bun pb compare <runA> <runB>        # Compare two runs
bun pb compare <runA> <runB> --json # Output raw JSON
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
│   └── compare-command.ts # Stub
├── schemas/              # Zod schemas (source of truth)
│   ├── config.schema.ts  # BenchConfig
│   ├── plan.schema.ts    # RunPlan, MatrixItem
│   └── result.schema.ts  # RunResult, MatrixItemResult
├── harnesses/            # Harness adapters
│   ├── harness.ts        # Common interface
│   ├── ollama-adapter.ts # Direct HTTP to Ollama
│   ├── goose-adapter.ts  # CLI via Goose (headless mode)
│   ├── opencode-adapter.ts # CLI via OpenCode (server mode)
│   ├── opencode-server.ts  # OpenCode server lifecycle management
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
│   └── failure-classifier.ts # Classify generation/scoring errors
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
    └── todo-app/         # CRUD todo manager
```

## Harnesses

All harnesses use Ollama as the backend provider:

| Harness | Method | Description |
|---------|--------|-------------|
| `ollama` | HTTP | Direct API calls to Ollama |
| `goose` | CLI | Headless mode with `--provider ollama --model` CLI flags |
| `opencode` | CLI | Server mode with `opencode serve` + `--attach` |

Discovery: `discoverHarnesses()` checks CLI availability and Ollama endpoint.

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

### OpenCode Server Mode
```bash
# Server (started once, reused, pre-warmed during plan build)
opencode serve --port 4096

# Generation (connects to warm server)
opencode run "<prompt>" --model ollama/<model> --attach http://localhost:4096 --format json
```
- Server mode bypasses 2+ min cold boot (32+ LSP servers, plugins)
- `opencode-server.ts` manages lifecycle with health checks
- **Important**: Models must be registered in `~/.config/opencode/opencode.json`
- **Prompt prefix**: Adapter prepends instructions telling OpenCode to output code directly (not write to files via Edit tool)
- **Code extraction**: Adapter applies `extractCode()` to capture code blocks from output

## Result Artifacts

Each run creates `results/<run-id>/`:
- `plan.json` - Expanded matrix plan (for reproducibility)
- `run.json` - Execution results with per-item details

## Schemas

| Schema | File | Purpose |
|--------|------|---------|
| `BenchConfig` | config.schema.ts | CLI input, defaults |
| `RunPlan` | plan.schema.ts | Expanded matrix (plan.json) |
| `RunResult` | result.schema.ts | Execution output (run.json) |
| `MatrixItem` | plan.schema.ts | Single matrix entry |
| `MatrixItemResult` | result.schema.ts | Item + generation result + scores |
| `ScoringSpec` | scoring.schema.ts | Data-driven test definitions |
| `AutomatedScore` | result.schema.ts | Passed/failed/total counts |
| `FrontierEval` | result.schema.ts | GPT-5.2 score + reasoning |
| `GenerationFailureType` | common.schema.ts | Failure type enum (timeout, api_error, etc.) |
| `ScoringFailureType` | common.schema.ts | Failure type enum (extraction, import, etc.) |

## Key Behaviors

- **Auto-discovery**: By default, discovers all models from Ollama, all harnesses available, and all tests in `src/tests/`
- **Limiting flags**: Use `--models`, `--harnesses`, `--tests` to limit which items to run
- **Sequential execution**: One item at a time
- **Dynamic timeouts**: Timeout scales with model size and harness (60s base + ceil(params/10) * 60s + harness overhead: Goose 1min, OpenCode dynamic 60s + params/10 * 30s)
- **Smart model unloading**: Model stays loaded for consecutive same-model items (Ollama)
- **Fail-fast validation**: Empty or very short output throws error immediately (catches silent failures)
- **Stderr fallback**: If stdout is empty but stderr has meaningful content, uses stderr as output
- **Model recognition errors**: Fast empty responses (<2s) indicate model not recognized by OpenCode (check config)
- **Failure handling**: Item failures recorded, don't crash run, exit 0
- **Failure categorization**: Errors classified as generation failures (timeout, api_error, harness_error, prompt_not_found) or scoring failures (extraction, import, export_validation, test_execution, spec_load, no_spec)
- **Debug logging**: Harness adapters log command execution and stderr for troubleshooting
- **Progress output**: `item 01/08: harness=ollama model=X test=Y pass=blind timeout=5m`

## Defaults

```typescript
{
  models: []                  // Auto-discover all from Ollama
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
│   ├── ui/                    # shadcn/ui components
│   ├── layout/                # Header, page containers
│   ├── run-list/              # Run list view
│   ├── run-detail/            # Run detail view + matrix table
│   ├── compare/               # Compare view + delta badges
│   └── charts/                # Recharts visualizations
├── hooks/                     # Data fetching hooks
├── lib/                       # Types, API, aggregations
└── pages/                     # Route components
```

**Features:**
- Run list with summary cards
- Run detail with matrix table, scoring breakdown, timing stats
- Compare view with delta badges and tabbed tables
- Charts: pass rate bars, timing histogram, frontier scatter plot

**Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts

## Current Status

- Setup phase: Complete (multi-harness support added)
- MVP phase: Complete (scoring, frontier eval, compare, enhanced stats)
- Scale & Polish phase: Dashboard frontend complete
