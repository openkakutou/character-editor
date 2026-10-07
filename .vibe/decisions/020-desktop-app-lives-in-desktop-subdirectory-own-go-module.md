---
date: 2026-10-07
status: accepted
---
# Desktop app lives in `desktop/`, its own Go module, GUI-free core

**Context:** Backlog 020 adds a native Fyne app next to the TypeScript web build, per roadmap decision 022.
**Decision:** The Go code is a separate module under `desktop/` that depends on the published `character` and `sff` releases. GUI-independent logic (`internal/session`) is split from the Fyne layer (`internal/ui`, `main.go`), and the UI is tested with Fyne's headless test driver. Per-OS builds run in `.github/workflows/desktop.yml`; a version tag attaches the packaged apps to its GitHub Release under fixed asset names, giving stable `releases/latest/download/<asset>` URLs.
**Reason:** Keeps the Node and Go toolchains from interfering, lets the core be tested without a display or system GL libraries, and reuses the same libraries as the web build.
**Rejected alternatives:** Go code at the repo root (mixes toolchains); a separate repo (decision 022 and the backlog keep it here); `fyne package` bundles (heavier, unsigned either way — can come with signing later).
