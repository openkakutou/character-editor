---
date: 2026-09-13
status: accepted
---
# Keyboard shortcut manager: action scope and click-through wiring

**Context:** Backlog item 011 asks this app to register its actions with `web-ui-kit`'s shared `ShortcutManager`/`<wuik-shortcuts-panel>` instead of hardcoding key bindings. The app currently has zero global keyboard shortcuts at all (only one unrelated hardcoded keydown handler: `animation-editor.ts`'s Clsn box arrow-key nudge, which is also reachable via numeric input and pointer drag, so it is not the *sole* path to that action and is left untouched).

**Decision:**
- Register exactly six actions: `undo`, `redo`, `download-all` (Save/Export), `add-animation`, `add-statedef`, `add-command`. Defaults: `Ctrl+Z`, `Ctrl+Y`, `Ctrl+S`, `Alt+Shift+A`, `Alt+Shift+S`, `Alt+Shift+C`.
- Each action id equals the `data-action` value already present on the one existing button that performs it. The global keydown listener does nothing but resolve the pressed combo to an action id and call `.click()` on `document.querySelector('[data-action="<id>"]')` — no action logic is duplicated, so the shortcut always produces exactly the same visible outcome (and the same defensive no-op-on-empty-history behavior `main.ts` already relies on for Undo/Redo) as a real click.
- "Import sprite" is excluded: it inherently needs a file picked first, so there is no single-step "add" a key press can complete.
- A generic "delete selection" is excluded: no selection concept exists anywhere in this app (lists use per-row Remove buttons); inventing one is out of scope for this feature. The shortcuts panel simply never lists a row for it — no placeholder, no disabled entry.
- Global shortcuts are suppressed when the event's (possibly shadow-retargeted) target is `<wuik-shortcuts-panel>` itself (avoids double-firing into an action while the panel is mid rebind-capture) or a text-editable control (`input`, `textarea`, `select`, `[contenteditable]`), regardless of modifiers — simplest rule that can never fight the panel's own capture or native text editing/undo.
- No bespoke "reset all" control is added beside `<wuik-shortcuts-panel>` — only what the shared component already offers (per-row reset), consistent with this app's "no ad-hoc UI beyond web-ui-kit" constraint.
- The panel is mounted as an always-visible inline section in `main` (its own heading, no character needs to be loaded first) rather than behind a toolbar-triggered modal/toggle — matches this app's existing "every screen appears inline" convention and keeps it reachable, focusable, real page content rather than a bolt-on overlay.

**Reason:** Reusing the existing `data-action` buttons as the actual trigger keeps the shortcut layer a thin, easily-verified mapping instead of a second copy of each action's validation/confirmation logic. Avoiding `Ctrl+Alt+*` defaults sidesteps AltGr (`Ctrl+Alt` synthesized by AltGr on many European keyboard layouts) firing these shortcuts by accident while typing accented characters; `Alt+Shift+*` has no such overlap. Every default is user-rebindable, so an imperfect default is only a minor inconvenience, not a defect.

**Rejected alternatives:** A per-action hand-written handler duplicating each button's logic — rejected, doubles the surface that can drift out of sync. A generic "Delete" shortcut bound to whichever row currently has DOM focus — rejected, no existing focus-tracked "selection" concept to hang it on, and guessing one is a product decision, not a technical default. A modal/dialog-hosted shortcuts panel — rejected, `web-ui-kit` has no modal built for this and the expert-consulted UX guidance was to keep it a real inline screen, matching this app's own established pattern.
