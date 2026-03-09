You are inside an isolated benchmark workspace.

Find the values for `ticket`, `version`, and `owner` by reading files in this workspace.

After finding them, create `reports/found-values.json` with this exact shape:

`{"owner":"<owner>","sourceCount":3,"ticket":"<ticket>","version":"<version>"}`

Constraints:

- Read files from the current directory only.
- Write only `reports/found-values.json`.
- Do not modify or delete any existing files.
