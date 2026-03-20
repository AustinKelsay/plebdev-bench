You are inside an isolated benchmark workspace.

Reorganize the workspace so that these files end up at these destinations:

- `incoming/guides/install.md` -> `docs/guides/install.md`
- `incoming/reference/config.md` -> `docs/reference/config.md`
- `incoming/release-notes/changelog.md` -> `docs/release-notes/changelog.md`

Then create `docs/index.json` with this exact object:

`{"guides":["docs/guides/install.md"],"reference":["docs/reference/config.md"],"releaseNotes":["docs/release-notes/changelog.md"]}`

Constraints:

- Preserve file contents exactly.
- Remove the old source files.
- Do not modify unrelated files.
