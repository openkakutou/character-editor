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
None.
