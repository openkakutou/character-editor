---
date: 2026-09-09
status: accepted
---
# Undo/redo captures deep-cloned before/after snapshots, not live references

**Context:** Building cross-editor undo/redo (item 010) on top of `web-ui-kit`'s `CommandStack` primitive, wired transparently inside `character-document.ts`'s existing `updateCharacterFields`/`addSpriteEdit`/`setCommandFile` mutation entry points so no editor screen needs its own history code.

**Decision:** Every `updateCharacterFields` call captures a `structuredClone` of the touched character state both before and after applying the patch, and stores those two clones (not live references) as the pushed command's undo/redo targets. `addSpriteEdit`/`setCommandFile` snapshot by reference instead (see Rejected alternatives) since their inputs are already treated immutably everywhere else in the codebase.

**Reason:** Several editors (`state-editor.ts`'s `def.controllers = ...`, `animation-editor.ts`'s `frame.clsn1 = [...]`) mutate a nested object *in place* before calling `onChange` with the same top-level array reference. By the time `updateCharacterFields` runs, `current.character`'s old and new values for the touched field are already the same mutated object graph — a reference-based "before" snapshot would silently already equal "after", making undo a no-op instead of a revert. A deep clone taken synchronously (before any further in-place mutation can occur, since JS is single-threaded) is the only reliable way to preserve the true prior state for these editors without refactoring their existing, already-tested in-place patterns.

**Rejected alternatives:** Refactoring every editor to stop mutating nested objects in place, so a plain reference snapshot would suffice — rejected as a much larger, riskier diff across already-shipped, tested screens, for no user-visible benefit over the cloning approach. Snapshotting the whole `CharacterDocument` (including `spriteEdits`/`files`) on every `updateCharacterFields` call — rejected as wasteful: `spriteEdits` can carry large pixel buffers and `files` never changes after load, so only the `character` field is cloned.
