Purpose: Document the setup phase implementation - minimal running CLI that executes benchmarks and writes reproducible artifacts.

# Setup Phase Implementation

## Summary

The setup phase delivers a working CLI that:
- Runs a benchmark matrix: `models × harnesses × tests × passTypes`
- Writes reproducible artifacts: `plan.json` + `run.json`
- Auto-discovers models from Ollama and tests from `src/tests/`
- Handles failures gracefully (records them, doesn't crash)

## Architecture

```
src/
├── index.ts                 # CLI entrypoint (shebang)
├── cli/
│   ├── index.ts             # Commander program setup
│   ├── run-command.ts       # `bench run` command
│   └── compare-command.ts   # `bench compare` stub
├── schemas/
│   ├── index.ts             # Re-exports
│   ├── common.schema.ts     # PassType, SCHEMA_VERSION
│   ├── config.schema.ts     # BenchConfig (CLI input)
│   ├── plan.schema.ts       # RunPlan, MatrixItem
│   └── result.schema.ts     # RunResult, MatrixItemResult
├── harnesses/               # Harness adapters
│   ├── harness.ts           # Common interface
│   ├── ollama-adapter.ts    # Direct HTTP to Ollama
│   ├── goose-adapter.ts     # CLI via Goose (headless mode)
│   ├── opencode-adapter.ts  # CLI via OpenCode (server mode)
│   ├── opencode-server.ts   # OpenCode server lifecycle management
│   ├── discovery.ts         # Detect available harnesses
│   └── index.ts             # Factory + re-exports
├── lib/
│   ├── logger.ts            # Pino with pino-pretty
│   └── run-id.ts            # Timestamp-based ID generator
├── runner/
│   ├── index.ts             # Main orchestration
│   ├── plan-builder.ts      # Discovery + matrix expansion
│   └── item-executor.ts     # Single item execution
├── results/
│   ├── writer.ts            # Write plan.json + run.json
│   └── reader.ts            # Read results (stub)
└── tests/
    └── smoke/               # First benchmark test
        ├── prompt.blind.md
        ├── prompt.informed.md
        └── scoring.test.ts  # Placeholder
```

### Data Flow

```
CLI Options → BenchConfig → RunPlan → Execution → RunResult
     ↓            ↓            ↓                      ↓
   Zod         Zod        plan.json              run.json
```

## CLI Interface

### Primary Command
```bash
bun pb [options]              # Shortcut for bench run
bun run bench run [options]   # Full form
```

### Options
| Flag | Description | Default |
|------|-------------|---------|
| `-m, --models <models...>` | Limit to specific models | All from Ollama |
| `-t, --tests <tests...>` | Limit to specific tests | All in src/tests/ |
| `-p, --pass-types <types...>` | Limit pass types: blind, informed | Both |
| `-H, --harnesses <harnesses...>` | Limit harnesses: ollama, goose, opencode | All available |
| `--ollama-url <url>` | Ollama API URL | http://localhost:11434 |
| `--timeout <ms>` | Generation timeout | 300000 |
| `-o, --output <dir>` | Output directory | results |

### Exit Codes
- `0` - Success (even if some items failed)
- Non-zero - Only on crashes (setup/write failures)

## Schemas

### BenchConfig (CLI Input)
```typescript
{
  models: string[]           // Empty = auto-discover all from Ollama
  harnesses: string[]        // Empty = auto-discover all available
  tests: string[]            // Empty = scan src/tests/
  passTypes: ("blind" | "informed")[]
  ollamaBaseUrl: string      // Default: "http://localhost:11434"
  generateTimeoutMs: number  // Default: 300_000
  outputDir: string          // Default: "results"
}
```

### RunPlan (plan.json)
```typescript
{
  schemaVersion: "0.1.0"
  runId: string              // e.g., "20260114-143052-abc123"
  createdAt: ISO datetime
  environment: {
    platform: string         // darwin, linux, win32
    bunVersion: string
    hostname: string
  }
  config: {
    ollamaBaseUrl: string
    generateTimeoutMs: number
    passTypes: string[]
  }
  items: MatrixItem[]        // Expanded matrix
  summary: {
    totalItems: number
    models: number
    harnesses: number
    tests: number
  }
}
```

### MatrixItem
```typescript
{
  id: string                 // "01", "02", etc.
  model: string              // "llama3.2:3b"
  harness: string            // "ollama"
  test: string               // "smoke"
  passType: "blind" | "informed"
}
```

### RunResult (run.json)
```typescript
{
  schemaVersion: "0.1.0"
  runId: string
  startedAt: ISO datetime
  completedAt: ISO datetime
  durationMs: number
  summary: {
    total: number
    completed: number
    failed: number
    pending: number
  }
  items: MatrixItemResult[]
}
```

### MatrixItemResult
```typescript
{
  ...MatrixItem
  status: "pending" | "completed" | "failed"
  startedAt: ISO datetime
  completedAt: ISO datetime
  generation: {
    success: boolean
    output?: string          // LLM response (if success)
    error?: string           // Error message (if failed)
    durationMs: number
    promptTokens?: number
    completionTokens?: number
  }
}
```

## Ollama Integration

### HTTP Client (`src/lib/ollama-client.ts`)

Thin fetch-based client with timeout via `AbortController`.

### Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/version` | GET | Health check / ping |
| `/api/tags` | GET | List available models |
| `/api/generate` | POST | Generate completion |

### Key Behavior
- Non-streaming mode only (`stream: false`)
- `keep_alive: 0` - Unloads model after generation to free memory
- Timeout applies per-request (default: 120s)
- Connection errors are thrown, not swallowed

### Generate Request
```typescript
{
  model: string
  prompt: string
  stream: false
  keep_alive: 0    // Unload after generation
  options?: {
    temperature?: number
    num_predict?: number
  }
}
```

## Runner Flow

### 1. Plan Building (`src/runner/plan-builder.ts`)

```
Config → Discovery → Matrix Expansion → RunPlan
```

**Discovery:**
- Models: If `config.models` is empty, fetch from Ollama `/api/tags`
- Tests: If `config.tests` is empty, scan `src/tests/` for directories

**Matrix Expansion:**
```typescript
for (model of models)
  for (harness of harnesses)
    for (test of tests)
      for (passType of passTypes)
        → MatrixItem
```

### 2. Execution Loop (`src/runner/index.ts`)

```typescript
for each item in plan.items:
  print progress: "item 01/08: model=X test=Y pass=blind"
  result = executeItem(item, ollamaBaseUrl, timeout)
  results.push(result)
```

**Sequential execution** - One model at a time to prevent memory pressure.

### 3. Item Execution (`src/runner/item-executor.ts`)

```
Load prompt → Call Ollama → Record result
```

**Prompt loading:** `src/tests/<test>/prompt.<passType>.md`

**Failure handling:** Catch errors, record in result, continue to next item.

## Configuration

### Defaults (via Zod)
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

### Environment
- Requires Bun runtime
- Requires Ollama running locally (or specify `--ollama-url`)

## Edge Cases

### Ollama Not Running
```
Error: Ollama is not reachable at http://localhost:11434. Is it running? Try: ollama serve
```

### No Models Found
```
Error: No models found in Ollama. Pull a model first: ollama pull llama3.2:3b
```

### Item Failure
- Error recorded in `generation.error`
- Status set to `"failed"`
- Run continues to next item
- Exit code remains 0

### Timeout
- **Dynamic timeout**: Scales with model size (60s base + 60s per 10B params + 60s CLI overhead)
- Model info fetched via `/api/show` before execution
- Clear error message: "Request timed out after Xs. Try increasing --timeout."
- Recorded as failure, run continues
- Min: 2 min, Max: 20 min

### Model Memory
- Smart unloading: model stays loaded for consecutive same-model items
- Unloads (`keep_alive: 0`) only when switching to a different model
- Prevents unnecessary reload overhead while still freeing memory between models

## Files Overview

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entrypoint |
| `src/cli/index.ts` | Commander program |
| `src/cli/run-command.ts` | Run command options/action |
| `src/cli/compare-command.ts` | Compare stub |
| `src/schemas/*.ts` | Zod schemas (config, plan, result) |
| `src/harnesses/harness.ts` | Common interface + types |
| `src/harnesses/ollama-adapter.ts` | Ollama HTTP adapter |
| `src/harnesses/goose-adapter.ts` | Goose CLI adapter (headless mode) |
| `src/harnesses/opencode-adapter.ts` | OpenCode CLI adapter (server mode) |
| `src/harnesses/opencode-server.ts` | OpenCode server lifecycle management |
| `src/harnesses/discovery.ts` | Detect available harnesses |
| `src/lib/logger.ts` | Pino setup |
| `src/lib/timeout.ts` | Dynamic timeout calculation |
| `src/lib/run-id.ts` | Run ID generator |
| `src/runner/index.ts` | Main orchestration |
| `src/runner/plan-builder.ts` | Discovery + matrix expansion |
| `src/runner/item-executor.ts` | Item execution |
| `src/results/writer.ts` | JSON file writing |

## Test Coverage

- `test/smoke.test.ts` - Basic deterministic tests
- `test/schemas.test.ts` - Schema validation tests
- `test/ollama-adapter.test.ts` - Mocked HTTP tests

Run with: `bun test`

## Open Questions

None for setup phase. Future phases will address:
- Automated scoring (Vitest against generated code)
- Frontier eval via OpenRouter
- Compare command implementation
