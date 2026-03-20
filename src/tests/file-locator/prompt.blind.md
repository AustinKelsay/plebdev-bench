You are inside an isolated benchmark workspace.

Find the values for `ticket`, `version`, and `owner` by reading files in this workspace.

After finding them, create `reports/found-values.json` with this exact shape:

`{"owner":"<owner>","sourceCount":3,"ticket":"<ticket>","version":"<version>"}`

The angle-bracket tokens are placeholders: replace `<owner>`, `<ticket>`, and `<version>` with the actual discovered values instead of writing the bracketed strings literally.

Constraints:

- Read files from the current directory only.
- Write only `reports/found-values.json`.
- Do not modify or delete any existing files.
