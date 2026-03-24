You are inside an isolated benchmark workspace.

Delete only these files:

- `build/tmp/app.tmp`
- `cache/session.cache`
- `logs/2026-01-01.log`

Then create `reports/cleanup-report.json` with this exact object:

`{"deleted":["build/tmp/app.tmp","cache/session.cache","logs/2026-01-01.log"],"preservedCount":3}`

Constraints:

- You may create the missing `reports/` directory if needed for the required output file.
- Do not delete or edit any other files.
- Do not create any file other than the cleanup report.
