Purpose: Setup phase plan (barebones but running) for `plebdev-bench`.

# Setup Phase

Ship a minimal, running CLI that can execute a single-item benchmark and write reproducible artifacts (`plan.json` + one `run.json`).

## Goals
- Establish the Bun-first repo, scripts, and local dev workflow.
- Implement a thin vertical slice: `bench run` → generate (Ollama) → write `results/<run-id>/{plan.json,run.json}`.
- Lock in the result schema and directory conventions early (schema-first).

## Scope
- In scope: CLI skeleton, schemas, three harnesses (Ollama HTTP, Goose CLI, OpenCode CLI), a minimal test stub, file output.
- Out of scope: full matrix runs, frontier eval via OpenRouter, rich compare UX, performance tuning.

## Steps (per feature)

### Feature A — Repo/tooling baseline (Bun-first)
1. Add Bun project scaffolding (package.json, scripts) and TypeScript config.
2. Add Vitest with a single deterministic “smoke” test.
3. Add basic lint/format tooling (keep minimal; prefer correctness over heavy rules).
4. Add `pino` logger wired for human-readable output by default.

### Feature B — Schemas + domain model (Zod as source of truth)
1. Define Zod schemas for:
   - `BenchConfig` (local-only config, auto-discovery toggles)
   - `RunPlan` (expanded matrix plan)
   - `RunResult` (one `run.json` per run, with summary + item list)
2. Add `schemaVersion` fields immediately and document the stability expectations.
3. Create typed helpers: parse config, generate plan, and validate written results.

### Feature C — CLI skeleton (single-command, non-interactive)
1. Implement `bench` CLI with `commander`, including:
   - `bench run` (required for setup)
   - `bench compare` stub (prints “not implemented yet” but validates args shape)
2. Ensure `bench run` is non-interactive and prints:
   - a short plan summary
   - deterministic progress counters
   - the output path to `results/<run-id>/`
3. Ensure exit code is non-zero only on crashes.

### Feature D — Thin vertical slice: multi-harness generation + result writing
1. Define a common `Harness` interface in `src/harnesses/harness.ts`:
   - `name: string`
   - `listModels(): Promise<string[]>`
   - `generate(opts: GenerateOpts): Promise<GenerateResult>`
   - `GenerateOpts`: `{ model, prompt, timeout }`
   - `GenerateResult`: `{ output, durationMs, error? }`
2. Implement `src/harnesses/ollama-adapter.ts` using `fetch`:
   - ping/health check (best-effort)
   - list models (auto-discovery)
   - generate completion (non-streaming for setup)
3. Implement `src/harnesses/goose-adapter.ts` using `execa`:
   - Run: `goose run --no-session --provider ollama --model <model> --max-turns 5 -q -t "<prompt>"`
   - **Critical CLI flags** (override config file):
     - `--provider ollama` - Force Ollama provider (ignores user's config file)
     - `--model <model>` - Specify exact model
     - `--max-turns 5` - Limit agentic loops (simple prompts don't need many)
     - `-q` - Quiet mode (faster output)
   - Set env (backup): `GOOSE_MODE=auto`, `GOOSE_CONTEXT_STRATEGY=summarize`, `GOOSE_MAX_TURNS=5`, `GOOSE_CLI_MIN_PRIORITY=0.2`
   - **Execution optimizations**:
     - `cwd: /tmp` - Run in temp dir to avoid codebase scanning
     - `stdin: "ignore"` - Prevent hanging on stdin (critical for headless)
   - Use stdout (validated for non-empty, min 10 chars); handle non-zero exit as structured error
4. Implement `src/harnesses/opencode-adapter.ts` using `execa` with **server mode**:
   - **Problem**: Cold boot takes 2+ min (32+ LSP servers, MCP connections, plugins)
   - **Solution**: Use persistent server + `--attach` mode
   - Implement `src/harnesses/opencode-server.ts` for server lifecycle:
     - `ensureServerRunning()` - Start server on port 4096 (or reuse existing)
     - `stopServer()` - Cleanup at end of benchmark run
     - Health check polls until server ready (30s timeout)
     - **Crash prevention**: Always check port health BEFORE starting new server
   - Server: `opencode serve --port 4096` (runs in /tmp, stdio: ignore)
   - Run: `opencode run "<prompt>" --model ollama/<model> --attach http://localhost:4096`
   - **Execution optimizations**:
     - `cwd: /tmp` - Avoid codebase scanning
     - `stdin: "ignore"` - Prevent hanging on stdin
   - Set env: `OPENCODE_DISABLE_AUTOUPDATE=true`, `OPENCODE_DISABLE_LSP_DOWNLOAD=true`, etc.
   - Use raw stdout (validated for non-empty, min 10 chars)
   - Handle timeouts and non-zero exit codes as structured errors
5. Add `src/harnesses/discovery.ts` to detect available harnesses:
   - Check CLI availability (`which goose`, `which opencode`)
   - Ping Ollama endpoint
6. Implement a single "smoke" benchmark test under `src/tests/<test>/`:
   - `prompt.blind.md` + `prompt.informed.md` (both passTypes required)
   - `README.md` describing what it is
   - `scoring.test.ts` can be a placeholder in setup (MVP will make it real)
7. Implement run execution for **one** matrix item (one model, one harness, one test, one passType).
8. Write `results/<run-id>/plan.json` and `results/<run-id>/run.json` with validated schemas.

### Feature E — Docs alignment
1. Update root `README.md` quickstart section to match the implemented CLI.
2. Add a short `llm/implementation/` note capturing the result schema and IO boundaries (optional but recommended).

## Exit Criteria
- `bun test` runs and passes.
- `bun run bench run ...` produces `results/<run-id>/plan.json` + one `run.json`.
- `run.json` validates against Zod schema and includes a clear failure shape for per-item errors.
- Common `Harness` interface defined; at least Ollama adapter fully implemented.
- At least one CLI harness adapter (Goose or OpenCode) is implemented and runnable (if CLI is installed).
- Smoke test includes both `prompt.blind.md` and `prompt.informed.md` (both passTypes).
- Docs updated to match what actually runs.

## Suggested Agent Prompt
```
Update @llm/project/phases/setup-phase.md with project-specific steps.
Keep scope minimal and shippable. List 3-5 actionable steps per feature.
```
