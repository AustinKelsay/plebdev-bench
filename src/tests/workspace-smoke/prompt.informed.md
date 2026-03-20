You are inside an isolated benchmark workspace for the `workspace-smoke` test.

Complete these exact filesystem operations:

1. Create `logs/session.log` with these exact bytes, including a trailing newline at EOF:
   `session-started\nworkspace-smoke\n`
2. Update `checklist/steps.txt` so its final contents are these exact bytes, including a trailing newline at EOF:
   `bootstrap\nverify-inputs\narchive-results\n`
3. Create `artifacts/summary.json` with:
   `{"status":"ready","createdBy":"workspace-smoke","steps":3}`

Acceptance requirements:

- Stay inside the current workspace.
- Do not modify `docs/notes.txt`.
- Do not create or delete any other files.
