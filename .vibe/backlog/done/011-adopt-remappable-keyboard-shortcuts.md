---
status: done
depends_on: [001]
---
# Adopt Remappable Keyboard Shortcuts from web-ui-kit

## Description
Register this app's actions (save/export, undo/redo, add sprite/animation/state, delete selection, etc.) with the shared keyboard-shortcut manager provided by `web-ui-kit`, instead of hardcoding key bindings, so users get a consistent, rebindable shortcut experience across every OpenKakutou editor. Motivated by a recurring Fighter Factory Ultimate complaint that shortcuts (e.g. Ctrl+S) could not be remapped.

## Acceptance Criteria
- [x] This app's key actions across its editors (items 003-008) are registered with default bindings through the shared shortcut manager
- [x] A user can rebind any of this app's registered shortcuts via the shared shortcuts panel and have it persist across reloads
- [x] No action in this app is reachable only through a hardcoded, non-remappable key handler

## Notes
Cross-repo blocker resolved: `web-ui-kit`'s `.vibe/backlog/010-remappable-keyboard-shortcut-manager.md` shipped (now in its `done/`), exposing `ShortcutManager`/`<wuik-shortcuts-panel>` from `@openkakutou/web-ui-kit@0.13.0`, already the pinned version here.

Six actions registered: `undo`, `redo`, `download-all` (Save/export), `add-animation`, `add-statedef`, `add-command`. "Import sprite" and a generic "delete selection" are out of scope — see `.vibe/decisions/014-shortcut-manager-scope-and-wiring.md` for why. The one pre-existing hardcoded key handler in this app (the animation editor's Clsn box arrow-key nudge) is left untouched: it's also reachable via numeric input and pointer drag, so it was never the *sole* path to that action and AC3 doesn't apply to it.
