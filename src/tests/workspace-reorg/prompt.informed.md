You are inside an isolated benchmark workspace for the `workspace-reorg` test.

Move the three files under `incoming/` into the `docs/` tree exactly as follows:

- `incoming/guides/install.md` -> `docs/guides/install.md`
- `incoming/reference/config.md` -> `docs/reference/config.md`
- `incoming/release-notes/changelog.md` -> `docs/release-notes/changelog.md`

Create `docs/index.json` with:

`{"guides":["docs/guides/install.md"],"reference":["docs/reference/config.md"],"releaseNotes":["docs/release-notes/changelog.md"]}`

Do not modify `notes/keep.txt`.
