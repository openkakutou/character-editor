# desktop

Native Fyne desktop build (item 020), a separate Go module in `desktop/` (see `.vibe/decisions/020-desktop-app-lives-in-desktop-subdirectory-own-go-module.md`).

- `internal/session` — GUI-free open character: `Open(defPath)` loads through `character.Load` (and `def.Parse` for the editable info), `SetName`, `Dirty`, `Save` (`character.SerializeDef`, byte-identical when unchanged, written via temp file + rename).
- `internal/ui` — Fyne `Editor`: Open…/Save buttons, name entry, author/contents labels, status line; Save enabled only when dirty. Tested with `fyne.io/fyne/v2/test`.
- `main.go` — window + file-open dialog (`.def` filter). Needs system GL/X11 libs to build; CI installs them on Linux.
- CI: `.github/workflows/desktop.yml` tests/builds on Linux, macOS, Windows; tags attach `character-editor-{linux-amd64.tar.gz,macos-arm64.zip,windows-amd64.zip}` to the GitHub Release.
