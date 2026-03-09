You are inside an isolated benchmark workspace for the `workspace-smoke` test.

Complete these exact filesystem operations:

1. Create `logs/session.log` with:
   `session-started`
   `workspace-smoke`
2. Update `checklist/steps.txt` so its final contents are:
   `bootstrap`
   `verify-inputs`
   `archive-results`
3. Create `artifacts/summary.json` with:
   `{"status":"ready","createdBy":"workspace-smoke","steps":3}`

Acceptance requirements:

- Stay inside the current workspace.
- Do not modify `docs/notes.txt`.
- Do not create or delete any other files.
