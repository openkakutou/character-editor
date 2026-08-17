---
status: todo
---
# Migrate Text Inputs To web-ui-kit Component

## Description
The characteristics editor (item 003) — and any later editor screen built the same way — uses plain, token-styled `<input>` elements for text fields because `web-ui-kit` has no generic text-input/form-field component yet. Once `web-ui-kit` ships one, migrate every such screen to it instead of the native-element stopgap.

## Acceptance Criteria
- [ ] Every plain `<input>` text field currently styled with `web-ui-kit` tokens directly (starting with the characteristics editor) is replaced by the real `web-ui-kit` text-input component
- [ ] The invalid/required-field visual and accessibility behavior (inline error, `aria-invalid`, non-verbal danger-colored cue) is preserved exactly, now provided by the component itself rather than this app's own CSS
- [ ] The native-element stopgap CSS this migration replaces is removed, not left dead alongside the new component

## Notes
Cross-repo: blocked on `web-ui-kit` actually publishing a generic text-input component — no such item exists in its backlog yet as of this writing. See character-editor's `.vibe/decisions/003-characteristics-editor-scope-and-native-inputs.md` for the stopgap this migrates away from, and `character-viewer-web`'s own `<wuik-viewport>` precedent (its backlog item 016) for the same pattern.
