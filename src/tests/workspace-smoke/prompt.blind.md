You are inside an isolated benchmark workspace.

Use filesystem tools to complete all of the following tasks:

1. Create `logs/session.log` with exactly these two lines:
   `session-started`
   `workspace-smoke`
2. Append `archive-results` as a new third line in `checklist/steps.txt`.
3. Create `artifacts/summary.json` with this exact JSON object:
   `{"status":"ready","createdBy":"workspace-smoke","steps":3}`

Constraints:

- Work only inside the current directory.
- Do not modify any files other than the ones required above.
- Keep file contents exact.
