# Purpose: Run a local vLLM server via Docker (Orbstack-friendly, CPU-only).
# Invariants: Exposes OpenAI-compatible API at http://localhost:8000/v1

## Start

```bash
export VLLM_VERSION=0.14.1
export VLLM_MODEL=alexchen4ai/Qwen3-8B-Instruct
export VLLM_TOOL_CALL_PARSER=hermes
export VLLM_MAX_MODEL_LEN=8192
docker compose -f docker/vllm/docker-compose.yml up -d
```

## Stop

```bash
docker compose -f docker/vllm/docker-compose.yml down
```

## Notes

- CPU-only image for macOS/arm64; performance will be slow on large models.
- Set `HF_TOKEN` in your shell if the model requires authentication.
- Override `VLLM_VERSION` to use a different image tag.
- Override `VLLM_MODEL` to use a different model.
- Override `VLLM_TOOL_CALL_PARSER` to match your model's tool-calling format.
- Override `VLLM_MAX_MODEL_LEN` to control context length (useful for tool prompts).
- The default model is `alexchen4ai/Qwen3-8B-Instruct` (text-only extraction of Qwen3-VL 8B).
