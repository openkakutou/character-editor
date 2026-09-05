---
status: done
depends_on: [007]
---
# Command Editor

## Description
Add a screen to edit `.cmd` command definitions: input sequences (directions/buttons, holds, timing windows) mapped to the states they trigger (from item 007's StateDef editor). Lets the user define new special-move inputs or edit existing ones.

## Acceptance Criteria
- [x] User can view and edit an existing command's input sequence and timing
- [x] User can create a new command and map it to a target state
- [x] Input sequence validation (e.g. an empty sequence, or a state reference that doesn't exist) shows a clear inline error instead of saving an invalid command
- [x] Command list reflects additions/edits/removals immediately in the in-memory model

## Notes
Cross-repo: needs `character` backlog item 036 (`.cmd` parsing) to load and round-trip existing command definitions.

## Blocked
2026-09-04: Item 036 is done, but its parsed `cmd.CommandFile` structure is not reachable from JS: `cmd/wasm/main.go` (pinned `character` v0.7.1, current HEAD) exposes `saveCmd` (serialize) but no read/parse entrypoint for `.cmd` bytes, and `.cmd` isn't wired into `load`/`character.LoadBytes` either. There is no WASM surface today to view an existing character's commands, which the first acceptance criterion requires. Filed `character` backlog item 056 (Expose `.cmd` Read/Parse Path Via WASM) to close this gap; this item is blocked until it ships and the version pin is bumped.

**Unblocked 2026-09-04**: `character` backlog item 056 shipped and released as `character` v0.8.0; this app's WASM pin was bumped to v0.8.0 (`loadCmd` now available). Back to `todo`.
