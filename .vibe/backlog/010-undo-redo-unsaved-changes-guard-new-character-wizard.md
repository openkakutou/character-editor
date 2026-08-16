---
status: todo
depends_on: [009]
---
# Undo/Redo And Unsaved-Changes Guard, New Character Wizard

## Description
Add cross-editor undo/redo (a single history stack spanning characteristics, sprites, palettes, animations, state logic, and commands), a guard that warns the user before navigating away or closing the tab with unsaved changes, and a "new character" wizard to create a character from scratch or from a template rather than only ever editing an imported one.

## Acceptance Criteria
- [ ] Undo/redo works across edits made in any of the editors (items 003-008), not just the most recently used one
- [ ] Closing the tab or navigating away with unsaved changes triggers a browser confirmation prompt; with no unsaved changes it does not
- [ ] The new-character wizard produces a valid minimal character (loadable by the editors) from either a blank template or a chosen preset
- [ ] Undo past the last recorded change, or redo past the most recent undo, is a no-op with no error, not a crash or history corruption

## Notes
Build the cross-editor history on top of `web-ui-kit`'s shared undo/redo command-stack primitive (`web-ui-kit`'s `.vibe/backlog/009-undo-redo-command-stack-primitive.md`) rather than a bespoke history implementation, so this app stays consistent with `stage-editor`/`lifebar-editor` and any fix lands once for all editors. That primitive is `status: todo` as of this writing — a soft cross-repo prerequisite for this item, even though not reflected in `depends_on` (same-repo only by convention).
