---
date: 2026-08-18
status: accepted
---
# Characteristics editor: scoped to the real `CharacterData` metadata, native token-styled inputs

**Context:** Backlog item 003's Description loosely mentions "name, display name, author, version" as editable fields, but `CharacterData` (the actual JSON contract exposed by the `character` WASM bridge, item 002) has no `displayName` or `version` field — only `name`, `author`, and 5 referenced-file-path strings (`spriteFile`, `animationFile`, `soundFile`, `commandFile`, `constantsFile`), plus 2 list fields (`stateFiles`, `palettes`). Separately, `web-ui-kit` — this app's design system for everything else — has no generic text-input/form-field component yet, only specialized ones (`wuik-slider`, `wuik-color-picker`) and `wuik-button`.

**Decision:**
- Edit exactly the fields the Acceptance Criteria actually name generically ("All `CharacterInfo` fields exposed by the... JSON contract") — the 2 scalar identity fields, 5 scalar file-reference fields, and 2 list fields on `CharacterData`. No `displayName`/`version` field is added to the data model or the form: those don't exist in the contract this item depends on, and inventing them would desync from what `character`'s WASM bridge actually returns.
- Only `name` is required (non-empty after trimming); every other scalar field accepts any string, including empty, since a real `.def` commonly omits several of these ([Files] entries beyond the ones already required to load the character in item 002).
- A list entry (`stateFiles`/`palettes`) that is blank/whitespace-only after the user leaves it is flagged inline and excluded from the committed array, rather than serialized as an empty string.
- Text fields use plain `<input>`/`<label>` elements styled with `web-ui-kit`'s `--wuik-*` tokens (never a literal px/hex value), reusing `web-ui-kit`'s own documented invalid-state contract (`.vibe/decisions/007-form-input-components-shared-conventions.md`: `is-invalid` class + `aria-invalid="true"` + a `--wuik-color-danger` border, inset focus ring) and its error-text-color rule (`.vibe/decisions/009-error-text-uses-text-token-not-danger.md`: message text in `--wuik-color-text`, never danger). Buttons (list row remove, add) stay real `<wuik-button>` elements — that component already exists, so there is no reason to duplicate it as plain markup.
- Filed as a follow-up: once `web-ui-kit` ships a real text-input component, migrate this screen (and any editor built on the same stopgap in the meantime) to it.

**Reason:** Following the Description's exact field list over the Acceptance Criteria's actual JSON-contract wording would add fields the app cannot load or save (no `displayName`/`version` anywhere in `character`'s output), producing a form that lies about what's editable. Native inputs styled with the same token/state contract `web-ui-kit`'s own components already use (confirmed via UI/UX and frontend-design consultation) keep this screen visually and behaviorally consistent with the rest of the app despite the missing component, and keep a later swap to a real component a styling-only change, not a rewrite.

**Rejected alternatives:**
- **Add `displayName`/`version` fields speculatively, ahead of `character` actually exposing them:** rejected — this repo doesn't own that contract; the fields would edit nothing real and desync silently the moment `character` does add them with a different shape.
- **Block this item until `web-ui-kit` ships a text-input component:** rejected — open-ended dependency on a different repo's backlog for a feature otherwise fully buildable today, the same reasoning `character-viewer-web`'s own `<wuik-viewport>` stopgap (its decision 007) already established for this org.
- **Invent a new `.error`/`.has-error` class instead of reusing `is-invalid`:** rejected — would silently diverge from the one invalid-state contract every other `web-ui-kit`-adjacent surface in this org already follows.
