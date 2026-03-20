# Workspace Reorg

Reorganization benchmark for bounded filesystem operations.
The final layout introduces new destination directories, so this benchmark requires directory creation support.

## Task

- move existing files into a new folder layout
- preserve file contents exactly
- create one index manifest
- remove the old source locations

## Pass Criteria

- destination files exist with exact contents
- source files are absent
- `docs/index.json` matches exactly
- unrelated files remain untouched
