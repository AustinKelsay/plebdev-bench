# Hermes Published Smoke Artifact

Purpose: Record the publication decision and exact command used for the first tracked Hermes benchmark artifact.

## Decision

Publish one combined Hermes smoke run instead of separate code-output and workspace runs. A combined run keeps the dashboard artifact small while proving both Hermes output paths in one **Run Plan**:

- `smoke` covers code-output generation with strict `solution.ts` handling.
- `workspace-tool-smoke` covers workspace read/write behavior and filesystem scoring.

## Published Run

- Run ID: `20260619-075023-35fca1`
- Output: `apps/dashboard/public/results/20260619-075023-35fca1/`
- Model: `qwen3.6:35b`
- Runtime: `ollama`
- Harness: `hermes`
- Pass type: `blind`
- Result: 2/2 items completed, 13/13 scored checks passed

## Command

OpenRouter frontier eval was disabled so the artifact is local-only and reproducible from Ollama + Hermes.

```bash
env OPENROUTER_API_KEY= bun run src/index.ts run \
  --runtimes ollama \
  --models qwen3.6:35b \
  --harnesses hermes \
  --tests smoke workspace-tool-smoke \
  --pass-types blind \
  --timeout 300000 \
  --machine-instance-id hermes-post-merge-m4-pro \
  --machine-display-label "Hermes Post-Merge M4 Pro" \
  --output /tmp/plebdev-hermes-publish-source-AWBSxu
```

Dashboard artifacts were rebuilt from the curated publication source:

```bash
bun run apps/dashboard/scripts/build-index.ts \
  --source-dir /tmp/plebdev-hermes-publish-source-AWBSxu \
  --output-dir apps/dashboard/public/results
```
