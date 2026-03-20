# File Search Smoke

Minimal workspace preflight for search-capable harnesses.
This task also requires creating a report in a missing directory, so it depends on `workspace-mkdir`.

## Task

- search a small nested workspace
- find one target value
- write one structured report

## Pass Criteria

- `reports/search-result.json` matches exactly
- no seeded files are modified or deleted
- no extra files are created
