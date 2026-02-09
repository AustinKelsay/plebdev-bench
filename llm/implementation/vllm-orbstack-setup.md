Purpose: Document the local vLLM (OrbStack + Docker Compose) setup and how plebdev-bench harnesses talk to it.

# vLLM + OrbStack Setup (macOS/arm64, CPU-only)

## Summary
- This repo runs vLLM as a local OpenAI-compatible API via Docker Compose (`docker/vllm/docker-compose.yml`) on macOS using OrbStack.
- vLLM downloads model weights at container startup into a host-mounted Hugging Face cache (`~/.cache/huggingface`).
- `plebdev-bench` can benchmark vLLM via:
  - direct OpenAI-compatible HTTP (`direct` harness)
  - Goose CLI (OpenAI provider) (`goose` harness)
  - OpenCode CLI (OpenAI-compatible provider config) (`opencode` harness)

## Scope
- In scope:
  - OrbStack memory sizing guidance for large fp16 models.
  - Compose start/stop + readiness checks.
  - Where models are stored (HF cache) and how pulling works.
  - Failure modes seen in multi-runtime runs and how to debug them.
- Out of scope:
  - GPU configs (this compose is CPU-only).
  - Automatic runtime lifecycle orchestration inside `plebdev-bench` (see "Single-run managed lifecycle").

## Current Behavior

### What runs where
- OrbStack provides the Docker engine on macOS (Linux VM under the hood).
- `docker/vllm/docker-compose.yml` runs a single container named `vllm` exposing port `8000`.
- vLLM serves an OpenAI-compatible endpoint at:
  - `http://localhost:8000/v1`

### Where model weights live
- Docker image: contains vLLM + runtime deps, not the model weights.
- Model weights: downloaded by vLLM (via Hugging Face) at container startup and cached on the host:
  - `${HOME}/.cache/huggingface` mounted to `/root/.cache/huggingface` in the container

### Memory behavior
- vLLM holds memory while the container is running (weights + KV cache + runtime).
- `plebdev-bench` does not stop vLLM automatically after a run.
- To release memory:
  - stop vLLM: `docker compose -f docker/vllm/docker-compose.yml down`

## Architecture

### Components
- vLLM container:
  - `docker/vllm/docker-compose.yml`
  - image: `public.ecr.aws/q9t5s3a7/vllm-arm64-cpu-release-repo:v${VLLM_VERSION:-0.14.1}`
- Benchmark runtimes:
  - `src/runtimes/vllm-runtime.ts` (OpenAI-compatible)
  - `src/runtimes/ollama-runtime.ts` (Ollama-native)
- Harnesses:
  - `src/harnesses/direct-adapter.ts` -> `src/lib/openai-compat-client.ts`
  - `src/harnesses/goose-adapter.ts` (Goose CLI)
  - `src/harnesses/opencode-adapter.ts` + helpers:
    - `src/harnesses/opencode-config.ts`
    - `src/harnesses/opencode-output.ts`
    - `src/harnesses/opencode-process.ts`

### Data flow (vLLM)
1. Start vLLM container with `VLLM_MODEL` (HF repo id).
2. vLLM downloads weights into HF cache (first start only).
3. `plebdev-bench` targets `vllmBaseUrl` (default `http://localhost:8000`) and calls:
   - `GET /health` and/or `GET /v1/models` for readiness
   - `POST /v1/chat/completions` for generation (OpenAI-compatible)

## Interfaces

### Compose control
```bash
# Start
export VLLM_MODEL=Qwen/Qwen2.5-14B-Instruct
docker compose -f docker/vllm/docker-compose.yml up -d

# Stop (releases container memory)
docker compose -f docker/vllm/docker-compose.yml down
```

### Readiness checks
```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/v1/models
```

### Benchmark run (one model across runtimes/harnesses/tests)
```bash
bun pb \
  --runtimes ollama vllm \
  --harnesses direct goose opencode \
  --timeout 900000 \
  --models qwen2.5-14b \
  --model-alias "qwen2.5-14b=ollama:qwen2.5:14b,vllm:Qwen/Qwen2.5-14B-Instruct"
```

### Single-run managed lifecycle (optional)
If you want Ollama to run without OrbStack/vLLM consuming memory for the whole run, you can run a single benchmark that:
1) runs Ollama items first, then
2) starts OrbStack + vLLM only for the vLLM segment, then
3) stops vLLM (and optionally OrbStack) when done.

```bash
cd /Users/plebdev/Desktop/code/plebdev-bench

bun pb \
  --runtimes ollama vllm \
  --harnesses direct goose opencode \
  --timeout 900000 \
  --manage-vllm \
  --vllm-model "Qwen/Qwen2.5-14B-Instruct" \
  --vllm-compose-file docker/vllm/docker-compose.yml \
  --vllm-startup-timeout 1800000
```

To also start/stop OrbStack around the vLLM segment:
```bash
  --manage-orbstack \
  --orbctl-path orbctl
```

Notes:
- Stopping OrbStack is disruptive if you use it for other containers, so it is opt-in.

## Configuration

### OrbStack memory sizing (important for 14B fp16)
For CPU-only fp16 models like `Qwen/Qwen2.5-14B-Instruct`, you generally need tens of GB of RAM available to Docker.
If Docker is capped too low, vLLM will often crash during load or later fail with 500s like:
- `EngineCore encountered an issue`

OrbStack stores Docker memory as `memory_mib`. Example (48 GiB):
```bash
/Users/plebdev/.orbstack/bin/orbctl config set memory_mib 49152
/Users/plebdev/.orbstack/bin/orbctl stop
/Users/plebdev/.orbstack/bin/orbctl start
```

Verify:
```bash
docker info --format 'TotalMemory={{.MemTotal}}'
```

### vLLM compose environment
- `VLLM_VERSION`: vLLM image tag (default `0.14.1`)
- `VLLM_MODEL`: HF model repo id (default `alexchen4ai/Qwen3-8B-Instruct`)
- `VLLM_MAX_MODEL_LEN`: context length (default `8192`)
- `VLLM_TOOL_CALL_PARSER`: tool call parser (default `hermes`)
- `HF_TOKEN`: optional, only for gated models

### KV cache sizing (optional tuning)
On CPU, vLLM may choose a large KV cache automatically. If you see high memory pressure, consider setting:
- `VLLM_CPU_KVCACHE_SPACE` (GiB)

This is not currently wired into `docker/vllm/docker-compose.yml` by default; add it only if you need a cap.

## Security & Privacy
- `HF_TOKEN` should be provided via environment only; do not commit it.
- Results in `results/<run-id>/run.json` include generated code and potentially prompt content; treat run artifacts as sensitive.

## Observability
- vLLM logs:
  - `docker logs --tail 200 vllm`
- Crash/OOM check:
  - `docker inspect vllm --format 'State={{.State.Status}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}'`
- Benchmark result artifacts:
  - `results/<run-id>/plan.json`
  - `results/<run-id>/run.json`

## Edge Cases
- **OOM during load**: model downloads succeed, then shard load is killed. Fix by increasing Docker memory.
- **Intermittent 500s mid-run**: often means EngineCore crashed after initial readiness; check logs and memory pressure.
- **Slow first request**: on CPU, long cold start is normal; prefer readiness checks before benchmarking.

## Open Questions
- Should `plebdev-bench` optionally manage vLLM lifecycle (compose up/down) to reclaim memory between runtime phases?
- Should we encode recommended OrbStack/Docker memory sizing directly in setup docs for specific model sizes?

## Change Notes
- `docker/vllm/docker-compose.yml` uses `vllm serve <model>` positional arg to avoid deprecated `--model` usage.
