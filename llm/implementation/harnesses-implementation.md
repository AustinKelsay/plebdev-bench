Purpose: Document the multi-harness architecture for running benchmarks through different LLM interfaces.

# Harnesses Implementation

## Summary

Harnesses are adapters that provide a unified interface for generating completions from LLMs. All harnesses use Ollama as the backend provider, but differ in how they invoke the model:

- **ollama**: Direct HTTP API calls
- **goose**: CLI wrapper via Goose
- **opencode**: CLI wrapper via OpenCode

This allows benchmarking the same models through different agent interfaces to compare their prompting and orchestration.

## Architecture

```
src/harnesses/
├── harness.ts           # Common interface + types
├── ollama-adapter.ts    # Direct HTTP to Ollama API
├── goose-adapter.ts     # CLI via execa (headless mode)
├── opencode-adapter.ts  # CLI via execa (server + attach mode)
├── opencode-server.ts   # OpenCode server lifecycle management
├── discovery.ts         # Detect available harnesses
└── index.ts             # Factory + re-exports
```

## Common Interface

```typescript
interface Harness {
  readonly name: HarnessName;
  ping(): Promise<boolean>;
  listModels(): Promise<string[]>;
  getModelInfo(model: string): Promise<ModelInfo>;  // For dynamic timeouts
  generate(opts: GenerateOpts): Promise<GenerateResult>;
}

interface ModelInfo {
  name: string;
  sizeBytes: number;
  parametersBillions: number;  // Used for timeout calculation
}

interface GenerateOpts {
  model: string;      // Ollama model name (e.g., "llama3.2:3b")
  prompt: string;
  timeoutMs: number;
  unloadAfter?: boolean;  // Ollama-specific
}

interface GenerateResult {
  output: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
}
```

## Harness Adapters

### Ollama Adapter
- Direct HTTP calls to Ollama API
- Endpoints: `/api/version`, `/api/tags`, `/api/generate`
- Supports `keep_alive` for model memory management
- Timeout via AbortController

### Goose Adapter

**Headless Mode Optimizations** (reduced timeout from 14+ min to ~34-49s):

- **CLI Command**:
  ```bash
  goose run --no-session --provider ollama --model <model> --max-turns 5 -q -t "<prompt>"
  ```

- **Critical CLI Flags** (override config file):
  - `--provider ollama` - Force Ollama provider (ignores `~/.config/goose/config.yaml`)
  - `--model <model>` - Specify exact model (e.g., `llama3.2:3b`)
  - `--max-turns 5` - Limit agentic loops (simple prompts don't need many turns)
  - `-q` - Quiet mode (faster output, less overhead)
  - `--no-session` - Don't persist session state

- **Environment Variables** (backup configuration):
  - `GOOSE_MODE=auto` - Non-interactive execution
  - `GOOSE_CONTEXT_STRATEGY=summarize` - Auto-summarize when context limits reached
  - `GOOSE_MAX_TURNS=5` - Reduced from 50 (env backup for CLI flag)
  - `GOOSE_PROVIDER=ollama` - Backend provider
  - `GOOSE_MODEL=<model>` - Model name
  - `GOOSE_CLI_MIN_PRIORITY=0.2` - Reduce verbose output

- **Execution Optimizations**:
  - `cwd: process.env.TMPDIR || "/tmp"` - Run in temp directory to avoid codebase scanning
  - `stdin: "ignore"` - Prevent hanging on stdin (critical for headless)

- **Output**: stdout (validated for non-empty, min 10 chars)
- **Debug logging**: logs command execution, completion, and stderr
- **Timeout**: via execa with 1 minute overhead for CLI startup

**Why `--provider` and `--model` flags are critical**: Without explicit CLI flags, Goose reads from its config file (`~/.config/goose/config.yaml`) which may specify a different provider (e.g., OpenAI). The CLI flags override the config file, ensuring Ollama is always used.

### OpenCode Adapter

**Server Mode Optimizations** (reduced timeout from 7+ min to ~28-77s):

OpenCode has significant cold boot overhead (~2+ minutes) because each `opencode run` starts:
- 32+ LSP servers
- MCP connections
- Plugin initialization
- Full codebase analysis

**Solution**: Use persistent server mode with `--attach`:

1. **Server Lifecycle** (`src/harnesses/opencode-server.ts`):
   ```typescript
   // Start server once, reuse for all requests
   const url = await ensureServerRunning(4096);  // Returns http://localhost:4096

   // Run generation against warm server
   opencode run "<prompt>" --model ollama/<model> --attach http://localhost:4096

   // Cleanup at end of benchmark run
   await stopServer();
   ```

2. **Server Startup**:
   ```bash
   opencode serve --port 4096
   ```
   - Runs in temp directory (`cwd: /tmp`) to avoid codebase scanning
   - `stdio: "ignore"` - Runs silently in background
   - Health check polls `http://localhost:4096` until ready (max 30s)

3. **Generation Command**:
   ```bash
   opencode run "<prompt>" --model ollama/<model> --attach http://localhost:4096
   ```
   - `--attach <url>` - Connect to warm server (bypasses cold boot)
   - `stdin: "ignore"` - Prevent hanging on stdin (critical for headless)
   - `cwd: /tmp` - Avoid codebase scanning

4. **Environment Variables** (headless optimization):
   - `OPENCODE_DISABLE_AUTOUPDATE=true`
   - `OPENCODE_DISABLE_LSP_DOWNLOAD=true`
   - `OPENCODE_DISABLE_DEFAULT_PLUGINS=true`
   - `OPENCODE_DISABLE_AUTOCOMPACT=true`
   - `OPENCODE_DISABLE_PRUNE=true`
   - `OPENCODE_DISABLE_TERMINAL_TITLE=true`
   - `OPENCODE_DISABLE_CLAUDE_CODE=true` (prevents .claude file reads)
   - `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=true`
   - `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=true`

5. **Server Crash Prevention**:
   - `ensureServerRunning()` always checks if port is healthy FIRST
   - Handles: reusing our server, externally started servers, orphaned servers from crashes
   - Only starts new server if no healthy server exists on the port

- **Output**: raw stdout (validated for non-empty, min 10 chars)
- **Debug logging**: logs command execution, completion, and stderr
- **Timeout**: via execa with 4 minute overhead (agentic behavior)

### OpenCode Server Module

`src/harnesses/opencode-server.ts` manages the singleton server:

```typescript
// Exported functions:
ensureServerRunning(port?: number): Promise<string>  // Returns server URL
stopServer(): Promise<void>                          // Cleanup
getServerUrl(): string | null                        // Current URL if running

// Automatic cleanup on:
// - process.exit
// - SIGINT (Ctrl+C)
// - SIGTERM
```

**Key invariants**:
- Only one server instance runs at a time
- Server auto-cleans up on process exit
- Health checks before reusing existing server
- 30s startup timeout with 500ms poll interval

## Discovery

`discoverHarnesses()` checks system availability:
1. Ollama: HTTP ping to `/api/version`
2. Goose: `which goose` + Ollama ping
3. OpenCode: `which opencode` + Ollama ping

All CLI harnesses require Ollama running since they use it as the backend.

## Factory

```typescript
const harness = createHarness("goose", {
  ollamaBaseUrl: "http://localhost:11434",
  defaultTimeoutMs: 300_000,
});
```

## CLI Usage

```bash
# Default: auto-discover all available harnesses
bun pb

# Limit to specific harness(es)
bun pb --harnesses ollama
bun pb --harnesses ollama goose
```

## Matrix Expansion

When multiple harnesses are specified, the matrix expands:
```
models × harnesses × tests × passTypes
```

Example with 2 models, 2 harnesses, 1 test, 2 passTypes = 8 items.

## Error Handling

- **Unavailable harnesses**: Error at plan build time
- **Empty output**: Throws error immediately (fail-fast) - catches silent failures
- **Stderr fallback**: If stdout is empty but stderr has content (≥10 chars), uses stderr as output
- **Fast empty response**: If output is empty and completes in <2s, provides improved error: "model may not be recognized by OpenCode" (helps diagnose model config issues)
- **Short output**: Output < 10 chars throws error - likely indicates failure
- **Generation failures**: Recorded in result, run continues
- **Timeouts**: Clear error message with suggestion to increase `--timeout`
- **Stderr capture**: Always logged (warns if non-empty on success path)

## Model Strategy

All harnesses share the same Ollama model pool:
- Model discovery always queries Ollama `/api/tags`
- Models specified in Ollama native format: `llama3.2:3b`
- CLI harnesses translate to their format internally:
  - Goose: `GOOSE_PROVIDER=ollama GOOSE_MODEL=llama3.2:3b`
  - OpenCode: `--model ollama/llama3.2:3b`

**OpenCode Model Configuration**: OpenCode requires models to be registered in its config file (`~/.config/opencode/opencode.json`). If a model exists in Ollama but not in OpenCode's config, it will fail with empty output. Add models to the config:

```json
{
  "provider": {
    "ollama": {
      "models": {
        "your-model:tag": { "name": "your-model:tag" }
      }
    }
  }
}
```

## Dynamic Timeouts

Timeouts scale with model size to handle large models gracefully:

```
timeout = base + (paramsBillions / 10 * 60s) + harnessOverhead
```

| Component | Value |
|-----------|-------|
| Base | 60s |
| Per 10B params | 60s |
| Goose overhead | 60s (1 min) |
| OpenCode overhead | 240s (4 min) |
| Minimum | 2 min |
| Maximum | 20 min |

**Harness-specific overhead rationale**:
- **Goose (1 min)**: CLI startup, headless mode initialization
- **OpenCode (4 min)**: Agentic behavior, tool calls, thinking loops (even with server mode, OpenCode runs multi-step reasoning)

**Examples:**
- 3B model on Ollama: 60s + 6s = ~2 min (floor)
- 30B model on Ollama: 60s + 180s = 4 min
- 30B model on Goose: 60s + 180s + 60s = 5 min
- 30B model on OpenCode: 60s + 180s + 240s = 8 min
- 70B model on OpenCode: 60s + 420s + 240s = 12 min

Model info is fetched via `/api/show` before execution starts.

## Performance Benchmarks

After optimizations, typical execution times for a 3B model:

| Harness | Before | After | Improvement |
|---------|--------|-------|-------------|
| Ollama | 5-8s | 5-8s | (baseline) |
| Goose | 14+ min (timeout) | 34-49s | ~20x faster |
| OpenCode | 7+ min (timeout) | 28-77s | ~10x faster |
