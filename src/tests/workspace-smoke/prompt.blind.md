You are inside an isolated benchmark workspace.

Complete these exact filesystem operations:

1. Create `logs/session.log` with the exact contents below, ending with a trailing newline:
   ```text
   session-started
   workspace-smoke
   ```
2. Overwrite `checklist/steps.txt` so its exact contents are the three lines below, ending with a trailing newline:
   ```text
   bootstrap
   verify-inputs
   archive-results
   ```
3. Create `artifacts/summary.json` so its exact contents are the JSON below, with no additional whitespace or fields:
   `{"status":"ready","createdBy":"workspace-smoke","steps":3}`

Acceptance requirements:

- Stay inside the current workspace.
- Only perform the requested writes to `logs/session.log`, `checklist/steps.txt`, and `artifacts/summary.json`.
- You may read other files, including `docs/notes.txt`, but must not modify them.
- Do not create, delete, or modify any other files.
