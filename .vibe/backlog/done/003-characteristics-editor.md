---
status: done
depends_on: [002]
---
# Characteristics Editor

## Description
Add a form-based screen to edit a loaded character's `CharacterInfo` fields (name, display name, author, version, and other top-level metadata from the `.def` file's `[Info]`-style section), backed by `web-ui-kit` form components. Edits update the in-memory character model that item 009 (Save/Export) will later serialize back out.

## Acceptance Criteria
- [ ] All `CharacterInfo` fields exposed by the `character` WASM bridge's JSON contract are editable through the form
- [ ] Edits are reflected immediately in the in-memory character model
- [ ] Required fields (e.g. name) cannot be cleared to empty without a visible validation error
- [ ] Invalid input (e.g. a version field in the wrong format) shows a clear inline error instead of silently accepting or crashing

## Notes
Cross-repo: needs `character` backlog item 038 (full metadata in the JSON contract) — currently the WASM bridge may not expose every `CharacterInfo` field this editor needs to round-trip.
