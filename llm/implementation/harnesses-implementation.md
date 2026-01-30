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
├── opencode-adapter.ts  # CLI via execa (direct mode with tool-calling)
├── opencode-server.ts   # OpenCode server lifecycle (deprecated, kept for reference)
├── tool-prompt.ts       # Tool-calling prompt builder
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
  goose run --no-session --provider ollama --model <model> -q --output-format json -i -
  # Prompt piped via stdin
  ```

- **Critical CLI Flags** (override config file):
  - `--provider ollama` - Force Ollama provider (ignores `~/.config/goose/config.yaml`)
  - `--model <model>` - Specify exact model (e.g., `llama3.2:3b`)
  - `-q` - Quiet mode (faster output, less overhead)
  - `--output-format json` - Structured output for reliable parsing
  - `--no-session` - Don't persist session state
  - `-i -` - Read prompt from stdin (avoids shell escaping issues)

- **Environment Variables**:
  - `GOOSE_PROVIDER=ollama` - Backend provider
  - `GOOSE_MODEL=<model>` - Model name
  - `GOOSE_CLI_MIN_PRIORITY=0.2` - Reduce verbose output
  - `GOOSE_MODE=auto` - Auto mode for agent behavior
  - `GOOSE_CONTEXT_STRATEGY=summarize` - Context handling strategy
  - `GOOSE_MAX_TURNS=40` - Maximum conversation turns

- **Execution Optimizations**:
  - `cwd: process.env.TMPDIR || "/tmp"` - Run in temp directory to avoid codebase scanning
  - `input: opts.prompt` - Pass prompt via stdin for robustness

- **Output**: stdout (validated for non-empty, min 10 chars)
- **Debug logging**: logs command execution, completion, and stderr
- **Timeout**: via execa with 1 minute overhead for CLI startup

**Why `--provider` and `--model` flags are critical**: Without explicit CLI flags, Goose reads from its config file (`~/.config/goose/config.yaml`) which may specify a different provider (e.g., OpenAI). The CLI flags override the config file, ensuring Ollama is always used.

### Tool-Calling Mode (Goose)

When running with `--with-builtin developer`, Goose can write code directly to files using the `text_editor` tool instead of outputting text.

**File-Based Code Extraction:**

1. **Prompt instructs Goose** to write code to `solution.ts`:
   ```
   Use the text_editor tool to write your code to "solution.ts" in the current directory.
   ```

2. **Execution creates temp directory** per generation:
   ```typescript
   const workDir = path.join(os.tmpdir(), `plebdev-bench-goose-${runId}`);
   ```

3. **After execution**, adapter checks for file:
   - If `solution.ts` exists and has ≥10 chars, `codeFilePath` is set
   - Otherwise falls back to text extraction from output

4. **GenerateResult includes both**:
   ```typescript
   return {
     output,        // May be empty for tool-call mode
     codeFilePath,  // Path to solution.ts if created
     durationMs,
   };
   ```

5. **Scorer prioritizes file** (`src/lib/scorer.ts:334-340`):
   ```typescript
   if (codeFilePath && fs.existsSync(codeFilePath)) {
     const code = await fs.promises.readFile(codeFilePath, "utf-8");
     extracted = { code, method: "file" };
   } else {
     extracted = extractCode(rawOutput);
   }
   ```

**JSON Escape Sequence Handling:**

When extracting code from tool-call JSON responses, `JSON.parse()` already correctly decodes escape sequences:
- `\"` → `"`
- `\n` → newline
- `\\n` → literal `\n`

**Important:** Do NOT post-process escape sequences after JSON.parse. Additional replacements like `.replace(/\\n/g, '\n')` would corrupt legitimate code escapes (e.g., regex `/\n/` or string literals `"\n"`).

### OpenCode Adapter

**Direct Mode with Tool-Calling** (current implementation):

OpenCode now runs directly in a unique work directory per generation, using tool-calling to write code to `solution.ts`.

1. **Command Structure**:
   ```bash
   opencode run "<prompt>" --model ollama/<model> --agent build --format json --log-level ERROR
   ```
   - `--agent build` - Uses build agent with all tools allowed
   - `--format json` - Structured JSONL output for reliable parsing
   - `--log-level ERROR` - Reduces noise in output
   - No `--attach` flag - runs directly without server

2. **Work Directory Setup**:
   ```typescript
   // Create unique temp directory in OpenCode's tool-output root
   const toolOutputRoot = resolveOpenCodeToolOutputRoot(); // ~/.local/share/opencode/tool-output
   const workDir = path.join(toolOutputRoot, `plebdev-bench-opencode-${runId}`);
   ```
   - Uses XDG_DATA_HOME location to avoid permission prompts
   - Initializes as git repo (OpenCode expects git context)
   - Creates local `opencode.json` config to enable tools

3. **Local Config File** (`opencode.json` in workDir):
   ```json
   {
     "provider": {
       "ollama": {
         "npm": "@ai-sdk/openai-compatible",
         "options": { "baseURL": "http://localhost:11434/v1" },
         "models": { "model:tag": { "name": "model:tag", "tools": true } }
       }
     },
     "permission": { "edit": "allow", "write": "allow", "read": "allow", "bash": "deny" },
     "tools": { "edit": true, "write": true, "read": false, "bash": false }
   }
   ```

4. **Environment Variables** (headless optimization):
   - `OPENCODE_DISABLE_AUTOUPDATE=true`
   - `OPENCODE_DISABLE_LSP_DOWNLOAD=true`
   - `OPENCODE_DISABLE_DEFAULT_PLUGINS=true`
   - `OPENCODE_DISABLE_AUTOCOMPACT=true`
   - `OPENCODE_DISABLE_PRUNE=true`
   - `OPENCODE_DISABLE_TERMINAL_TITLE=true`
   - `OPENCODE_DISABLE_WEBSEARCH=true`
   - `OPENCODE_DISABLE_WEBFETCH=true`
   - `OPENCODE_DISABLE_CLAUDE_CODE=true`

5. **Tool-Calling Flow**:
   - Prompt uses `buildToolPrompt()` to instruct tool usage
   - OpenCode writes code to `solution.ts` via edit/write tool
   - Code read from file after execution
   - Fallback: extract tool call from JSON output if file not created
   - Fails with `tool_missing` if no code produced

6. **Stale Output Detection**:
   - Monitors stdout/stderr for activity
   - Kills hung processes after 2 minutes of no output (scales with timeout)
   - Uses process tree kill (pkill + kill) for reliable cleanup

- **Debug logging**: logs command execution, completion, and stderr
- **Timeout**: via AbortController with stale output detection

### Tool-Calling Mode (OpenCode)

OpenCode uses its built-in `write` tool to write code directly to files instead of outputting text.

**File-Based Code Extraction:**

1. **Prompt instructs OpenCode** to write code to `solution.ts`:
   ```
   Use the write tool to write your code to "solution.ts" in the current directory.
   ```

2. **Execution creates temp directory** per generation:
   ```typescript
   const workDir = path.join(os.tmpdir(), `plebdev-bench-opencode-${runId}`);
   ```

3. **After execution**, adapter checks for file:
   - If `solution.ts` exists and has ≥10 chars, `codeFilePath` is set
   - Otherwise falls back to text extraction from output

4. **GenerateResult includes both**:
   ```typescript
   return {
     output,        // May be empty for tool-call mode
     codeFilePath,  // Path to solution.ts if created
     durationMs,
   };
   ```

5. **Scorer prioritizes file** (`src/lib/scorer.ts:331-340`):
   ```typescript
   if (codeFilePath && fs.existsSync(codeFilePath)) {
     const code = await fs.promises.readFile(codeFilePath, "utf-8");
     extracted = { code, method: "file" };
   } else {
     extracted = extractCode(rawOutput);
   }
   ```

### OpenCode Tool Calling Requirements

**CRITICAL**: Unlike Goose (which uses `--with-builtin developer` CLI flag), OpenCode requires explicit tool enablement in the config file for **EACH model**.

| Harness | Tool Enabling Method |
|---------|---------------------|
| Goose | CLI flag: `--with-builtin developer` |
| OpenCode | Config file: `"tools": true` per model |

**Configuration** (`~/.config/opencode/opencode.json`):
```json
{
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "your-model:tag": {
          "name": "your-model:tag",
          "tools": true
        }
      }
    }
  }
}
```

Without `"tools": true`, OpenCode will NOT pass tool calls to the model, and `solution.ts` will never be created.

**Troubleshooting:**
- If "solution.ts not created" appears in logs, check model config has `tools: true`
- If tools still don't work, try increasing `num_ctx` in Ollama (16k-32k minimum recommended)
- Verify the model supports tool/function calling (not all models do)

### OpenCode Server Module (Deprecated)

`src/harnesses/opencode-server.ts` was used for server mode with `--attach`. Now deprecated in favor of direct mode, but kept for reference.

The current implementation runs OpenCode directly without a server, which provides:
- Simpler architecture (no server lifecycle management)
- Reliable tool execution (server mode had tool call issues)
- Per-generation isolation (unique work directory)

### Tool Prompt Builder

`src/harnesses/tool-prompt.ts` provides `buildToolPrompt()` for tool-calling harnesses:

```typescript
interface ToolPromptOptions {
  toolNames: string[];      // e.g., ["edit", "write"]
  solutionFilename: string; // e.g., "solution.ts"
  taskPrompt: string;       // Original task prompt
  toolUsageHint?: string;   // e.g., 'path = "solution.ts", content = "..."'
}

function buildToolPrompt(options: ToolPromptOptions): string;
```

The prompt instructs models to:
1. Use specified tools to write code to file
2. Output complete, working TypeScript
3. Not use markdown code blocks or explain code

Used by both Goose and OpenCode adapters for consistent tool-calling behavior.

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
- **Scoring with file output**: Scoring/frontier eval runs when `codeFilePath` exists, even if text `output` is empty (supports Goose and OpenCode tool-calling modes)

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
timeout = base + ceil(paramsBillions/10) * 60s + harnessOverhead
```

| Component | Value |
|-----------|-------|
| Base | 60s |
| Per 10B params | ceil(params/10) * 60s |
| Goose overhead | 60s (1 min) |
| OpenCode overhead | 60s + (params/10 * 30s) (dynamic, B.4 optimization) |
| High-precision multiplier | 5x (bf16/fp16/f32) |
| Large model overhead | +300s (>20B params) |
| Minimum | 1 min |
| Maximum | 20 min |

**Harness-specific overhead rationale**:
- **Goose (1 min)**: CLI startup, headless mode initialization
- **OpenCode (dynamic)**: Scales with model size: 60s base + 30s per 10B params (smaller models get shorter timeouts)

**Examples (base + sizeScaling + harnessOverhead + largeModelOverhead):**
- 3B model on Ollama: 60 + 60 + 0 + 0 = 120s (2 min)
- 9B bf16 on Ollama: (60 + 60 + 0 + 0) × 5 = 600s (10 min)
- 30B model on Ollama: 60 + 180 + 0 + 300 = 540s (9 min)
- 30B model on Goose: 60 + 180 + 60 + 300 = 600s (10 min)
- 3B model on OpenCode: 60 + 60 + 69 + 0 = 189s (~3 min)
- 30B model on OpenCode: 60 + 180 + 150 + 300 = 690s (~11.5 min)

Model info fetched in parallel via `/api/show` before execution starts (B.5 optimization).

## Performance Benchmarks

After optimizations, typical execution times for a 3B model:

| Harness | Before | After | Improvement |
|---------|--------|-------|-------------|
| Ollama | 5-8s | 5-8s | (baseline) |
| Goose | 14+ min (timeout) | 34-49s | ~20x faster |
| OpenCode | 7+ min (timeout) | 28-77s | ~10x faster |

## Tool-Smoke Test

`src/tests/tool-smoke/` provides a preflight test for tool-calling harnesses.

**Purpose:**
- Verify that a model/harness combination can successfully use tools
- Run before other tests to detect tool failures early
- Skip remaining items for model/harness if tool-smoke fails

**Test Design:**
- Simple task: write an `add(a, b)` function that returns the sum
- Minimal complexity to isolate tool-calling from code generation
- Pass criteria: file created with valid TypeScript function

**Runner Integration** (`src/runner/item-executor.ts`):
- Tool-smoke items run first per model/harness
- Failures recorded as `tool_missing` generation failure type
- Subsequent items for same model/harness marked as tool failures

**Dashboard Integration:**
- Tool success rate displayed in CompositeScoreChart
- Tooling breakdown panel shows per-model/harness stats
- Tool-smoke items excluded from pass rate calculations
