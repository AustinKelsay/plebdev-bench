# File Delete Smoke

Minimal workspace preflight for delete-capable harnesses.
This task also requires creating a report in a missing directory, so it depends on `workspace-mkdir`.

## Task

- delete one approved file
- keep one protected file
- emit one tiny report

## Pass Criteria

- `trash/obsolete.txt` is deleted
- `notes/keep.txt` remains untouched
- `reports/delete-result.json` matches exactly
