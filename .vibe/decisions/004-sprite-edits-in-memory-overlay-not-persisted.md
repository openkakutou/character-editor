---
date: 2026-08-19
status: accepted
---
# Sprite import/replace/delete edits are an in-memory overlay, not written into `.sff` yet

**Context:** Backlog item 004 needs a sprite browser that lets the user import, replace, and delete sprites. The `sff` WASM module's own published surface only exposes `load`/`resolveSprites` — no encode/save global — even though the Go-level v2 pixel encode this item's own Notes name as its cross-repo blocker (`sff` item 002) has since shipped. Re-encoding an edited sprite sheet back into a real `.sff` file therefore isn't actually reachable from this app yet, regardless of that item's own status.

**Decision:** Sprite edits (add/replace/delete) are tracked as a separate overlay — `CharacterDocument.spriteEdits` — computed against the read-only, WASM-parsed `CharacterData.sprites`, never mutating `CharacterData` itself. An add/replace edit carries the imported image's already-decoded RGBA pixels, previewed directly instead of resolved via the WASM bridge. Actually writing these edits back into a `.sff` file is deferred to the save/export item (009), which already depends on this one.

**Reason:** `CharacterData` is documented to mirror the WASM `load()` JSON contract field-for-field; adding an edit-tracking field to it (or a pixel buffer `Sprite` never carries) would misrepresent that contract for every other reader of the type. A separate overlay keeps the read-only parse result and the pending edits cleanly distinguishable, and matches this item's own acceptance criteria, which describe in-memory editing behavior only — none of them require a persisted `.sff` file.

**Rejected alternatives:**
- *Wait for `sff`'s WASM module to expose an encode call before starting this item* — rejected: nothing in this item's acceptance criteria needs it, and the Notes' own cross-repo reference names the Go-level `sff` item 002 (done) as the blocker, not the WASM surface specifically — the persistence step belongs to item 009 regardless.
- *Add a `pixels`/`edited` field directly to the `Sprite`/`CharacterData` types* — rejected: would leak this app's own editing state into a type meant to mirror an external JSON contract, and would force every other consumer of `CharacterData` (e.g. a future animation editor) to account for a field that means nothing to the WASM boundary.
