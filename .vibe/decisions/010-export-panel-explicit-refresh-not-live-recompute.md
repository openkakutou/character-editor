---
date: 2026-09-05
status: accepted
---
# Export panel recomputes on an explicit action, not live on every edit elsewhere

**Context:** The export panel's file list depends on state five other screens can change (characteristics, sprites, animations, state/combat logic, commands). `animation-editor.ts` already established a "re-render against the document's latest state on every relevant change" pattern for its own cross-cutting sprite-existence check, wired from `main.ts`. The export panel could follow the same live pattern, or instead only recompute when the user explicitly asks.

**Decision:** The export panel computes its file list once when it first renders (right after the character loads, so it shows something useful immediately), and again only when the user clicks its own "Refresh export" action — never automatically on every keystroke in another editor.

**Reason:** Unlike the animation editor's sprite-existence check (a cheap synchronous array scan), computing the export list calls the WASM `save*` functions — several JSON round-trips through the Go runtime per file. `characteristics-editor.ts` commits on every `input` event (per keystroke, not on blur), so wiring a live recompute the same way the animation editor does would fire that WASM work on every keystroke while typing a name, with no debounce mechanism already established anywhere in this codebase to borrow. An explicit action matches the export panel's own nature (it is the one screen whose whole purpose is a deliberate "I'm done editing, produce the files" action) and the existing precedent of other explicit, non-live actions in this app (the palette editor's "Save as .act", "Add command", "Add StateDef").

**Rejected alternatives:** Live recompute on every `onChange` the same way `animation-editor.ts` is re-rendered — rejected: no existing debounce/throttle utility exists in this codebase to introduce cheaply, and firing several WASM calls per keystroke is wasteful for a panel the user only needs right before downloading. Debouncing the live recompute — rejected for now as a genuinely new pattern this codebase doesn't otherwise use, kept as a possible future refinement rather than introduced speculatively here.
