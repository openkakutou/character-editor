---
date: 2026-08-17
status: accepted
---
# File input: 4 required + 2 optional slots, held in an in-memory `CharacterDocument`

**Context:** Backlog item 002 asks for a file input accepting `.def`/`.air`/`.sff`/`.cns`/`.cmd`/`.zss`, superset of `character-viewer-web`'s existing 4-file input. The `character` WASM module's `load` call hard-requires exactly `.def`/`.air`/`.sff`/`.cns` bytes — it has no parse call for `.cmd`/`.zss` at all yet (only a later `save*` call that needs the *original* bytes plus already-edited JSON, not something this item produces). A real character also uses `.cns` **or** `.zss` for combat logic, never both, and `.cmd` is common but not universal.

**Decision:**
- `.def`/`.air`/`.sff`/`.cns` are **required** slots: completeness of these 4 alone triggers the WASM `load` call, exactly mirroring `character-viewer-web`'s existing interaction model.
- `.cmd`/`.zss` are **optional** slots: their raw bytes are captured and held, but never parsed or validated by this item — there is nothing in the current WASM boundary that could do so yet. An empty optional slot is not an error state.
- The slot list is driven by one config array (kind, extension, required) rather than hardcoded required/optional markup, so a future optional kind doesn't require reworking the list rendering.
- A duplicate file for an optional kind records that slot's own error but never blocks the auto-load attempt for an otherwise-complete required set; only a duplicate on a *required* kind does.
- The successfully loaded result (typed character plus the raw bytes read for every filled slot, required and optional) is stored in a minimal in-memory `CharacterDocument` (get/set, no persistence) — the form later editor items (003-008) read from and eventually write back to, satisfying the item's last acceptance criterion without building any editor UI itself.

**Reason:** The 4/2 split follows directly from what the WASM boundary can actually do today — treating `.cmd`/`.zss` as required would either block every real-world load on files the bridge can't use yet, or silently misrepresent them as validated when they aren't. Keeping one interleaved, config-driven slot list (rather than two visually separated groups) avoids doubling the `aria-live` regions a screen reader announces per drop, per UI/UX consultation, while a plain "(optional)" text suffix (no new badge shape) keeps the visual language inside `web-ui-kit`'s existing token set, per frontend-design consultation.

**Rejected alternatives:**
- **Treat all 6 as required**: rejected — the WASM `load` call cannot consume `.cmd`/`.zss` bytes at all, and a real `.zss`-based character legitimately has no `.cns` file, so a hard requirement would make otherwise-valid characters unloadable.
- **Two separate slot lists/panels (required vs. optional)**: rejected — doubles the `aria-live` announcement surface for a 6-item list and gives "optional" undue visual weight, per UI/UX consultation.
- **Defer `.cmd`/`.zss` capture entirely to a later item**: rejected — the backlog item's own acceptance criteria and description explicitly scope them into this item, as a superset of the viewer's 4-file input.
