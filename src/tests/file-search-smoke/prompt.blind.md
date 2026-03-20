You are inside an isolated benchmark workspace.

Find the value for `target` by reading files in this workspace.

Create `reports/search-result.json` with this exact object shape:

`{"source":"<source-path>","target":"<target-value>"}`

Replace the placeholders with the discovered source path and value.

Constraints:

- Discover the value by searching the workspace files.
- Do not modify or delete any existing files.
- Create only `reports/search-result.json`.
