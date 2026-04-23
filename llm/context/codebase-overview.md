Purpose: Quick reference for the current codebase structure and key commands.

# Codebase Overview

Local-first CLI benchmark runner for local LLMs. Runs matrix of `runtime × harness × model × test × passType` and writes reproducible artifacts.

Test categories:
- `coding`
- `computer-use`

Computer-use tests use seeded fixture workspaces plus exact filesystem assertions.

## Key Commands

```bash
bun pb                              # Run all (Ollama runtime; auto-discovers harnesses/models/tests)
bun pb --models llama3.2:3b         # Limit to specific model
bun pb --tests smoke                # Limit to specific test
bun pb --categories coding          # Limit to specific category
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

- `OPENROUTER_API_KEY` - Enables frontier eval via OpenRouter (GPT-5.4)

## Module Layout

```
src/
├── index.ts              # CLI entrypoint
├── cli/
│   ├── index.ts          # Commander program
│   ├── run-command.ts    # `bench run` implementation
│   └── compare-command.ts # Compare command
├── schemas/              # Zod schemas (source of truth)
│   ├── common.schema.ts  # SCHEMA_VERSION, PassType, SupportedRuntimeNameSchema, ArtifactRuntimeNameSchema
│   │                     # Supported runtime selection = ollama; artifact runtime also accepts legacy vllm
│   ├── config.schema.ts  # BenchConfig
│   ├── plan.schema.ts    # RunPlan, MatrixItem
│   └── result.schema.ts  # RunResult, MatrixItemResult
├── runtimes/             # Runtime adapters (inference backends)
│   ├── runtime.ts        # Runtime interface + types
│   ├── ollama-runtime.ts # Ollama HTTP implementation
│   └── index.ts          # Factory + exports
├── harnesses/            # Harness adapters (interface layer)
│   ├── harness.ts        # Common interface
│   ├── direct-adapter.ts # Direct HTTP to runtime (was ollama-adapter)
│   ├── goose-adapter.ts  # CLI via Goose (headless mode)
│   ├── opencode-adapter.ts # CLI via OpenCode (direct mode)
│   ├── tool-prompt.ts    # Tool-calling prompt builder
│   ├── discovery.ts      # Detect available harnesses
│   └── index.ts          # Factory + exports
├── lib/
│   ├── logger.ts         # Pino logger
│   ├── run-id.ts         # ID generator
│   ├── timeout.ts        # Dynamic timeout calculation
│   ├── code-extractor.ts # Extract code from LLM markdown output
│   ├── code-module-scorer.ts # Code-module scoring engine
│   ├── scorer.ts         # Run automated scoring via isolated worker/in-process fallback
│   ├── scoring-spec.ts   # Scoring spec loader + rubric helpers
│   ├── test-workspace.ts # Seed isolated fixture workspaces
│   ├── workspace-manifest.ts # Workspace baseline snapshot + diffing
│   ├── workspace-scorer.ts # Workspace assertion scorer
│   ├── benchmark-checkpoint.ts # Checkpoint manifest hashing
│   ├── hardware-profile.ts # Machine profile collection
│   ├── openrouter-client.ts # Frontier eval via OpenRouter API
│   ├── stats.ts          # Run statistics calculation + formatting
│   ├── failure-classifier.ts # Classify generation/scoring errors
│   ├── test-catalog.ts   # Test catalog discovery + category filtering
│   └── tool-smoke.ts     # Tool-smoke/preflight constants + pass-type selection
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
    ├── tool-smoke/       # Quick preflight that verifies tool support and basic code-output sanity
    ├── calculator-basic/ # Stateless arithmetic functions
    ├── calculator-stateful/ # Calculator with memory
    ├── todo-app/         # CRUD todo manager
    ├── rate-limiter/     # Per-key fixed-window limiter
    ├── ttl-cache/        # Deterministic TTL cache
    ├── event-emitter/    # Listener lifecycle semantics
    ├── workspace-tool-smoke/ # Read/write workspace preflight (no implicit mkdir)
    ├── file-search-smoke/ # Search-capability workspace preflight
    ├── file-delete-smoke/ # Delete-capability workspace preflight
    ├── workspace-smoke/  # Create/append/emit JSON inside a seeded workspace
    ├── file-locator/     # Search workspace files and write one report
    ├── targeted-edit/    # One precise file edit
    ├── workspace-reorg/  # Move files into a required folder layout
    └── safe-cleanup/     # Delete only approved files and emit an audit report
    # each test directory also includes test.meta.json with category metadata
```

## Architecture: Runtimes vs Harnesses

The architecture separates **runtimes** (inference backends) from **harnesses** (interface adapters):

- **Runtime**: An inference backend that provides models (e.g., Ollama). Runtimes handle model discovery, health checks, and metadata.
- **Harness**: An interface adapter that sends prompts to a runtime (e.g., direct HTTP, Goose CLI, OpenCode CLI).

### Runtimes

| Runtime | Method | Description |
|---------|--------|-------------|
| `ollama` | HTTP | Local Ollama server at configured URL |

### Harnesses

All harnesses use a Runtime for the actual inference:

| Harness | Method | Description | Advertised workspace capabilities |
|---------|--------|-------------|----------------------------------|
| `direct` | HTTP | Direct API calls to runtime (was "ollama" harness) | none |
| `goose` | CLI | Headless mode with `--provider ollama --model` CLI flags | `workspace-read`, `workspace-write` |
| `opencode` | CLI | Direct mode with `opencode run` (tool-calling) | `workspace-read`, `workspace-write`, `workspace-mkdir`, `workspace-search`, `workspace-delete` |

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
opencode run "<prompt>" --model ollama/<model> --format json
```
- Runs directly in a temporary work directory (no server mode)
- Uses `edit` or `write` tool to create `solution.ts` for code-output tests (`code-module` scoring mode, where one generated module is imported and scored)
- Uses `read`, `glob`, `grep`, and `bash` during workspace-mode tests (`workspace` scoring mode, where tools mutate a seeded multi-file workspace and the final filesystem state is scored)
- Local `opencode.json` config enables tools and sets permissions
- Code read from file after execution (tool-calling mode)
- Falls back to tool call extraction from JSON output if needed
- **Preflight gate**: tagged preflight tests run first to verify the capability slice needed by later items

## Result Artifacts

Each run creates `results/<run-id>/`:
- `plan.json` - Expanded matrix plan (for reproducibility)
- `run.json` - Execution results with per-item details
- `run.partial.json` - Crash-safe checkpoint written periodically during long runs

## Schemas

Schema version: `0.5.2`

| Schema | File | Purpose |
|--------|------|---------|
| `SupportedRuntimeNameSchema` | common.schema.ts | Live config/runtime names (`"ollama"`) |
| `ArtifactRuntimeNameSchema` | common.schema.ts | Artifact runtime names (`"ollama"`, legacy `"vllm"`) |
| `TestCategorySchema` | common.schema.ts | Test categories ("coding", "computer-use") |
| `HarnessCapabilitySchema` | common.schema.ts | Workspace capability requirements (`workspace-read`, `workspace-write`, `workspace-mkdir`, `workspace-search`, `workspace-delete`) |
| `TestScoringModeSchema` | common.schema.ts | Test scoring modes ("code-module", "workspace") |
| `BenchConfig` | config.schema.ts | CLI input, defaults |
| `RunPlan` | plan.schema.ts | Expanded matrix (plan.json) |
| `RunResult` | result.schema.ts | Execution output (run.json) |
| `MatrixItem` | plan.schema.ts | Single matrix entry (includes runtime) |
| `MatrixItemResult` | result.schema.ts | Item + generation result + scores |
| `ScoringSpec` | scoring.schema.ts | Data-driven test definitions |
| `AutomatedScore` | result.schema.ts | Passed/failed/total counts |
| `FrontierEval` | result.schema.ts | GPT-5.4 score + reasoning |
| `GenerationFailureType` | common.schema.ts | 6 types: timeout, api_error, tool_missing, harness_error, prompt_not_found, unknown |
| `ScoringFailureType` | common.schema.ts | 9 types: extraction, import, missing_export, factory_init_failed, export_validation, test_execution, spec_load, no_spec, unknown |
| `FrontierEvalFailureType` | common.schema.ts | 8 types: timeout, auth_error, rate_limited, http_error, invalid_response, parse_error, truncated, unknown |

## Key Behaviors

- **Runtime selection**: By default, runs only the Ollama runtime; no port or secondary-runtime auto-discovery occurs
- **Auto-discovery**: By default, discovers all models from Ollama, all harnesses available, and all tests in `src/tests/` (with categories and scoring modes from `test.meta.json`)
- **Limiting flags**: Use `--models`, `--harnesses`, `--tests`, `--categories`, and `--runtimes ollama` to limit which items to run
- **Capability-aware scheduling**: Tests with `requiredHarnessCapabilities` only run on harnesses that advertise every required capability
- **Test-aware timeouts**: Tests can declare `timeoutMultiplier` in `test.meta.json`, and the resolved multiplier is copied into each matrix row
- **Workspace-root anchoring**: Tool-harness workspace prompts include the concrete seeded root path so models are explicitly told where the allowed workspace begins and ends
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
- **Preflight ordering**: Tests tagged `preflight` run first per runtime/model/harness and use a single pass type to reduce overhead
- **Preflight skip behavior**: `tool_missing` in a preflight causes later items in that runtime/model/harness slice to be skipped as tool failures
- **Failure handling**: Item failures recorded, don't crash run, exit 0
- **Failure categorization**: Errors classified as generation failures (timeout, api_error, harness_error, prompt_not_found) or scoring failures (extraction, import, export_validation, test_execution, spec_load, no_spec)
- **Infra retry**: `harness_error` is retried once automatically, with fresh workspace reseeding for workspace rows (matrix items using `workspace` scoring mode)
- **Result interpretation**: CLI summaries now separate semantic scored-check pass rate (passed scored checks divided by total scored checks), item success rate (completed items divided by total scheduled items), and scored-row coverage (items with at least one scored check divided by total scheduled items) so generation failures are not hidden behind the headline pass rate
- **Frontier eval failures**: Recorded per-item in `frontierEvalFailure` with type/message/status when OpenRouter calls fail
- **Debug logging**: Harness adapters log command execution and stderr for troubleshooting
- **Progress output**: `item 01/08: runtime=ollama harness=direct model=X test=Y pass=blind timeout=5m`

## Defaults

```typescript
{
  runtimes: ["ollama"],       // Fixed active runtime
  models: [],                 // Auto-discover all from Ollama
  harnesses: [],              // Auto-discover all available
  tests: [],                  // Auto-discover all from src/tests/
  categories: [],             // Auto-discover all categories
  passTypes: ["blind", "informed"],
  ollamaBaseUrl: "http://localhost:11434",
  generateTimeoutMs: 300_000, // 5 minutes (for large models)
  outputDir: "results",
}
```

## Dashboard (`apps/dashboard/`)

React-based visual dashboard for browsing benchmark results, inspecting latest-checkpoint aggregates, and explaining benchmark semantics.

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
│   ├── leaderboard/           # Leaderboard UI (filters, table, cards, charts)
│   ├── about/                 # Benchmark/about page content
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
- Leaderboard with latest-checkpoint aggregate, filters, summary cards, and charts
- Run list with summary cards
- Run detail with matrix table, scoring breakdown, timing stats
- About page describing benchmark, scoring, aggregation, and test semantics
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
- Tool-smoke test runs first per runtime/model/harness to verify tool support

## Current Status

- Setup phase: Complete (multi-harness support added)
- MVP phase: Complete (scoring, frontier eval, compare, enhanced stats)
- Scale & Polish phase: Complete (dashboard frontend, harness optimizations, tool-smoke tests)
