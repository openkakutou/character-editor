---
date: 2026-09-09
status: accepted
---
# The unsaved-changes guard uses its own dirty flag, not `CommandStack.canUndo`

**Context:** Item 010 needs a `beforeunload` confirmation exactly when there are unsaved changes. The same shared `CommandStack` used for undo/redo already exposes `canUndo`, which is `true` whenever there is any history to revert.

**Decision:** Track a separate boolean "dirty" flag (`markDirty`/`markClean`/`isDirty` in `src/history/app-history.ts`), not derived from `canUndo`. It is set on every history push (any edit, in any editor including the palette editor), cleared on a fresh character load, and cleared again when the user clicks the Export panel's "Download all" action.

**Reason:** `canUndo` answers "is there history to revert", not "does the current state differ from what was last saved". After a successful export, `canUndo` stays `true` forever (the edit history isn't erased by saving) — deriving dirty from it would keep warning the user on every tab close even right after they saved, training them to ignore the prompt. `CommandStack` also exposes no stack position/index to compare against a "last saved" mark, so an exact "back to the exact saved state" comparison isn't cheaply buildable on top of it.

**Rejected alternatives:** Deriving `isDirty` from `canUndo` — rejected for the stale-after-save false positive above. Clearing dirty on every individual per-file "Download" click, not just "Download all" — rejected because downloading one of several files isn't a complete save of the character; treated as a scope simplification (noted in the feature's assumptions) rather than tracking per-file save completeness.
