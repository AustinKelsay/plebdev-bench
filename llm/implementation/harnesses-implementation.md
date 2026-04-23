Purpose: Document the multi-harness architecture for running benchmarks through different LLM interfaces.

# Harnesses Implementation

## Summary

The benchmark system separates **runtimes** (inference backends) from **harnesses** (interface adapters):

- **Runtime**: An inference backend that provides model discovery and metadata (e.g., Ollama)
- **Harness**: An interface adapter that sends prompts to models via a runtime

Available harnesses:
- **direct**: Direct HTTP API calls to the runtime (was "ollama")
- **goose**: CLI wrapper via Goose
- **opencode**: CLI wrapper via OpenCode

This allows benchmarking the same models through different agent interfaces to compare their prompting and orchestration.

## Architecture

```
src/runtimes/             # Runtime adapters (inference backends)
├── runtime.ts            # Runtime interface + types
├── ollama-runtime.ts     # Ollama HTTP implementation
├── discovery.ts          # Detect available runtimes
└── index.ts              # Factory + exports

src/harnesses/            # Harness adapters (interface layer)
├── harness.ts            # Common interface + types
├── direct-adapter.ts     # Direct HTTP to runtime (was ollama-adapter)
├── goose-adapter.ts      # CLI via execa (headless mode)
├── opencode-adapter.ts   # CLI via execa (direct mode with tool-calling)
├── tool-prompt.ts        # Tool-calling prompt builder
├── discovery.ts          # Detect available harnesses
└── index.ts              # Factory + re-exports
```

## Runtime Interface

Runtimes are responsible for model discovery and metadata:

```typescript
interface Runtime {
  readonly name: RuntimeName;  // "ollama"
  readonly baseUrl: string;
  ping(): Promise<boolean>;
  listModels(): Promise<string[]>;
  getModelInfo(model: string): Promise<ModelInfo>;
}

interface ModelInfo {
  name: string;
  sizeBytes: number;
  parametersBillions: number;  // Used for timeout calculation
}
```

## Harness Interface

Harnesses use a Runtime for the actual inference:

```typescript
interface Harness {
  readonly name: HarnessName;  // "direct", "goose", "opencode"
  ping(): Promise<boolean>;
  generate(opts: GenerateOpts): Promise<GenerateResult>;
}

interface GenerateOpts {
  model: string;      // Ollama model name (e.g., "llama3.2:3b")
  prompt: string;
  timeoutMs: number;
  unloadAfter?: boolean;  // Ollama-specific
  runtime: Runtime;   // Runtime to use for generation
}

interface GenerateResult {
  output: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  codeFilePath?: string;  // Path to code file (tool-calling harnesses)
}
```

Note: `listModels()` and `getModelInfo()` have moved from Harness to Runtime.

## Runtime Adapters

### Ollama Runtime (`src/runtimes/ollama-runtime.ts`)
- Direct HTTP calls to Ollama API
- Endpoints: `/api/version`, `/api/tags`, `/api/show`
- Provides model discovery and metadata
- Timeout via AbortController

## Harness Adapters

### Direct Adapter (`src/harnesses/direct-adapter.ts`)
- Direct HTTP calls to the runtime's API (POST `/api/generate`)
- Uses `runtime.baseUrl` for API calls
- `ping()` always returns true (availability is determined by runtime)
- Streaming mode keeps connection alive during model loading (critical for bf16)
- Supports `keep_alive` for model memory management

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

### Workspace Benchmark Mode

- Goose workspace prompts are now anchored to the concrete seeded workspace root path via `buildWorkspaceToolPrompt()` and the adapter-provided `workspaceRootPath`.
- "Read/write-only Goose rows" means rows whose `requiredHarnessCapabilities` are limited to `workspace-read` and `workspace-write`, which is the conservative capability set advertised by Goose in `src/harnesses/harness.ts`.
- "Preseeded fixture directories" are created during workspace setup from each test's `fixtures/` tree (`src/lib/test-workspace.ts`) so read/write-only rows can create nested files without also requiring mkdir capability.
- Directory-creation, search, and delete tasks are scheduled only onto harnesses that advertise `workspace-mkdir`, `workspace-search`, and `workspace-delete` in `HARNESS_CAPABILITY_MAP`.

### OpenCode Adapter

**Direct Mode with Tool-Calling** (current implementation):

OpenCode now runs directly in a unique work directory per generation, using tool-calling to write code to `solution.ts`.

1. **Command Structure**:
   ```bash
   opencode run --model ollama/<transport-model-key> --format json --log-level ERROR [--pure] --dir <workspace> "<prompt>"
   ```
   - `--format json` - Structured JSONL output for reliable parsing
   - `--log-level ERROR` - Reduces noise in output
   - `--pure` (when supported) - Runs without external plugins
   - `--dir <workspace>` - Forces OpenCode to run from the exact benchmark workspace
   - No `--attach` flag - runs directly without server
   - Older OpenCode builds may not expose `--pure`; the adapter detects supported run features and omits the flag automatically.

2. **Work Directory Setup**:
   ```typescript
   // Create unique temp directory in OpenCode's tool-output root
   const toolOutputRoot = resolveOpenCodeToolOutputRoot(); // ~/.local/share/opencode/tool-output
   const workDir = path.join(toolOutputRoot, `plebdev-bench-opencode-${runId}`);
   ```
   - Code-output mode creates an isolated generated workspace under XDG data home
   - Workspace mode uses the runner-provided seeded workspace
   - Both modes pass the canonical workspace `realpath()` to `--dir`
   - Config files are written into a separate generated config directory
   - No git initialization is required by the adapter

3. **Local Config File** (`opencode.json` in the per-run config directory):
   ```json
   {
     "enabled_providers": ["ollama"],
     "model": "ollama/model:tag",
     "provider": {
       "ollama": {
         "npm": "@ai-sdk/openai-compatible",
         "options": { "baseURL": "http://localhost:11434/v1" },
         "models": { "model:tag": { "name": "model:tag", "tools": true } }
       }
     },
     "permission": {
       "*": "allow",
       "external_directory": "deny",
       "question": "deny",
       "task": "deny",
       "skill": "deny",
       "webfetch": "deny",
       "websearch": "deny",
       "codesearch": "deny",
       "lsp": "deny"
     }
   }
   ```
   - `enabled_providers` prevents user-global provider bleed
   - Slash-containing runtime model IDs use a slash-safe transport key while preserving the real runtime model name in `models`
   - Top-level deprecated `tools` config is not emitted; tool access is controlled through `permission`
   - `external_directory` is denied because OpenCode is already launched inside the benchmark workspace

4. **Environment Variables** (headless optimization):
   - `OPENCODE_CONFIG_DIR=<per-run-config-dir>`
   - `OPENCODE_CONFIG=<per-run-opencode.json>`
   - `OPENCODE_CONFIG_CONTENT=<inline JSON config>`
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
   - Code-output prompts ask OpenCode to write `solution.ts` with the `write` tool
   - Workspace-mode prompts switch to `buildWorkspaceToolPrompt()` and explicitly advertise `read`, `glob`, `grep`, and `bash`
   - Workspace prompts use relative paths only; absolute workspace paths are not included in the prompt
   - Code read from file after execution
   - Fallback: if no file is created but assistant text contains usable code, persist it to `solution.ts` and mark the row tainted for output-contract violation
   - Workspace mode does not require chat output; the workspace scorer decides semantic success
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

Unlike Goose, OpenCode uses generated provider config plus `permission` rules rather than a CLI flag like `--with-builtin developer`.

| Harness | Tool Enabling Method |
|---------|---------------------|
| Goose | CLI flag: `--with-builtin developer` |
| OpenCode | Generated per-item provider config + `permission` policy |

The benchmark no longer requires users to add benchmark models to `~/.config/opencode/opencode.json`. The adapter generates the model entry inline for each item:
```json
{
  "enabled_providers": ["ollama"],
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

The model-level `"tools": true` entry remains in the generated provider model entry, but top-level deprecated `tools` config is not emitted.

**Troubleshooting:**
- If "solution.ts not created" appears in logs, inspect the row's generated config/debug output first; user-global OpenCode config should not be required
- If tools still don't work, try increasing `num_ctx` in Ollama (16k-32k minimum recommended)
- Verify the model supports tool/function calling (not all models do)

### OpenCode Direct Mode

The repo no longer carries the old `--attach` server helper. The current implementation runs OpenCode directly without a server, which provides:
- Simpler architecture (no server lifecycle management)
- Reliable tool execution (server mode had tool call issues)
- Per-generation isolation (unique workspace/config directories)

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

It also provides `buildWorkspaceToolPrompt()` for workspace-mode filesystem tasks:

```typescript
interface WorkspaceToolPromptOptions {
  toolNames: string[];         // e.g., ["text_editor"] or ["read", "glob", "grep", "bash"]
  taskPrompt: string;          // Original filesystem task prompt
  workspaceRootPath?: string;  // Absolute seeded workspace root for sandbox anchoring
  toolUsageHint?: string;      // Optional minimal hint for tool arguments
}

function buildWorkspaceToolPrompt(
  options: WorkspaceToolPromptOptions,
): string;
```

Unlike `buildToolPrompt()`, this variant is for workspace-mode rows instead of code-output rows: it advertises the exact filesystem tools available for the harness, reminds the model it is already inside an isolated workspace, and anchors operations to the seeded workspace root path when provided.

## Discovery

### Runtime Discovery (`src/runtimes/discovery.ts`)

`discoverRuntimes()` checks which inference backends are available:
1. Ollama: HTTP ping to `/api/version`

### Harness Discovery (`src/harnesses/discovery.ts`)

`discoverHarnesses()` checks system availability:
1. Direct: Always available (runtime availability checked separately)
2. Goose: `which goose` + runtime ping
3. OpenCode: `which opencode` + runtime ping

All CLI harnesses require a runtime to be available since they use it as the backend.

## Factory

```typescript
const harness = createHarness("goose", {
  ollamaBaseUrl: "http://localhost:11434",
  defaultTimeoutMs: 300_000,
});
```

## CLI Usage

```bash
# Default: auto-discover all available runtimes and harnesses
bun pb

# Limit to specific runtime(s)
bun pb --runtimes ollama

# Limit to specific harness(es)
bun pb --harnesses direct
bun pb --harnesses direct goose

# Note: 'ollama' is accepted as a legacy alias for 'direct'
bun pb --harnesses ollama  # same as --harnesses direct
```

## Matrix Expansion

When multiple runtimes and harnesses are specified, the matrix expands:
```
runtimes × harnesses × models × tests × passTypes
```

Example with 1 runtime, 2 harnesses, 2 models, 1 test, 2 passTypes = 8 items.

Computer-use rows are additionally filtered by `requiredHarnessCapabilities` from each test's `test.meta.json`. This prevents impossible combinations like a delete benchmark on a harness that only advertises read/write support.

`requiredHarnessCapabilities` is an array of explicit capability tokens from `HarnessCapabilitySchema`: `workspace-read`, `workspace-write`, `workspace-mkdir`, `workspace-search`, and `workspace-delete`. Those tokens map directly to the advertised harness support in `src/harnesses/harness.ts`.

Minimal example:

```json
{
  "schemaVersion": 1,
  "category": "computer-use",
  "requiresTools": true,
  "requiredHarnessCapabilities": [
    "workspace-read",
    "workspace-write",
    "workspace-search"
  ]
}
```

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

**OpenCode Model Configuration**: OpenCode model registration is generated per benchmark item. Do not edit `~/.config/opencode/opencode.json` for benchmark rows; inspect the generated row config/debug output when troubleshooting model wiring. The adapter emits provider `models` entries with model-level `"tools": true` and does not emit deprecated top-level `tools` config:

```json
{
  "enabled_providers": ["ollama"],
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

If tool calls still fail after the generated config is correct, verify the model supports tool/function calling and increase Ollama `num_ctx` when needed.

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

## Preflight Tests

Current preflight behavior is documented in `llm/implementation/computer-use-hardening.md`.

In short:
- preflight coverage is tag-based and capability-specific (`tool-smoke`, `workspace-tool-smoke`, `file-search-smoke`, `file-delete-smoke`)
- tests tagged `preflight` run first per runtime/model/harness and use a single pass type
- a preflight failure with `tool_missing` skips later tool-dependent items for that same slice
- capability-qualified matrix filtering prevents impossible computer-use rows from being scheduled
