---
date: 2026-09-05
status: accepted
---
# Command editor: state link via keyed ChangeState controller, required unique name, whole-row validity gate

**Context:** Backlog item 008 requires viewing/editing a character's `.cmd` commands and mapping a command to a target combat state. `.cmd` isn't wired into `CharacterData`; the read path (`character` WASM's `loadCmd`) returns a separate `CommandFile` (`remap`, `defaults`, `commands`, `states` — the `[Statedef -1]` "always" state). `character/cmd`'s own docs describe the real file format's command-to-state link as flowing through an existing `ChangeState` controller's `command = "<name>"` trigger, not a dedicated field. The acceptance criteria also require an inline error for an empty input sequence or an unknown target state, blocking the save of an invalid command.

**Decision:**
1. A command's target-state mapping is represented exactly as the real format does it: a `ChangeState` controller inside `commandFile.states`, triggered by `command = "<commandName>"`, with `value` holding the target state number. Clearing the target-state field removes that controller; renaming a command re-keys it (remove the old trigger, add the new one) in the same commit.
2. A command's Name is a required, unique field — not explicitly listed in the acceptance criteria, but needed for the link above to be unambiguous: two commands sharing a name would make one silently overwrite the other's `ChangeState` controller. A blank or duplicate name is an inline error on the Name field itself.
3. Row validity is all-or-nothing: a row with any error (blank/duplicate name, blank input, or an unknown target state) is excluded entirely from the committed `CommandFile` — both its `Command` entry and its state link — until fixed, rather than partially saving the valid parts. Loading an existing (possibly already-invalid) `.cmd` file never discards data: the raw parsed `CommandFile` is handed to the caller once, as-is, before any edit; only a subsequent user edit applies the validity gate.
4. `Remap`/`Defaults` are preserved untouched but not exposed in this screen — no acceptance criterion asks for editing them, and building UI for them would be speculative.

**Reason:** Reusing the real format's own linking mechanism (rather than inventing a parallel field) keeps a future `saveCmd` round trip trivial and matches how `state-editor.ts`'s own StateDef/Controller model already works. Requiring a unique name closes an otherwise-silent data-loss path the acceptance criteria don't call out but the mechanism above makes real. All-or-nothing row validity mirrors `characteristics-editor.ts`'s existing list-row precedent (a blank row is excluded from the committed array, not partially included) rather than introducing a new, more permissive rule just for this screen.

**Rejected alternatives:**
- *A separate `targetState` field directly on `Command`, synthesizing the `ChangeState` controller only at save time* — rejected: duplicates state, and defers the very validation (does this state exist, is the link consistent) the acceptance criteria ask for at edit time.
- *Allowing two commands to share a name* — rejected: makes the link mechanism itself lossy (last-committed row silently wins).
- *Partially committing a row (e.g. keep the Command but drop only the broken target-state link)* — rejected: acceptance criteria call an invalid row an "invalid command," not "a command with an invalid mapping" — treating the whole row as unsaved is the more conservative, easier-to-explain rule.
