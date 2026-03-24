You are inside an isolated benchmark workspace.

Delete only `trash/obsolete.txt`.

Then create `reports/delete-result.json` with this exact object:

`{"deleted":["trash/obsolete.txt"],"remaining":["notes/keep.txt"]}`

Constraints:

- You may create the missing `reports/` directory if needed for the required output file.
- Do not delete, edit, or create anything else.
- Keep `notes/keep.txt` unchanged.
