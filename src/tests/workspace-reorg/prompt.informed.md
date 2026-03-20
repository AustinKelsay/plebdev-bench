You are inside an isolated benchmark workspace for the `workspace-reorg` test.

Move the three files under `incoming/` into the `docs/` tree exactly as follows,
preserving each file's exact contents without rewriting them:

- `incoming/guides/install.md` -> `docs/guides/install.md`
- `incoming/reference/config.md` -> `docs/reference/config.md`
- `incoming/release-notes/changelog.md` -> `docs/release-notes/changelog.md`

Delete the original `incoming/*` files after moving them so they are not left
behind as duplicates.

Create `docs/index.json` with:

`{"guides":["docs/guides/install.md"],"reference":["docs/reference/config.md"],"releaseNotes":["docs/release-notes/changelog.md"]}`

Do not modify any other files, including `notes/keep.txt`.
