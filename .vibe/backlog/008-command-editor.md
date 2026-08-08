---
status: todo
depends_on: [007]
---
# Command Editor

## Description
Add a screen to edit `.cmd` command definitions: input sequences (directions/buttons, holds, timing windows) mapped to the states they trigger (from item 007's StateDef editor). Lets the user define new special-move inputs or edit existing ones.

## Acceptance Criteria
- [ ] User can view and edit an existing command's input sequence and timing
- [ ] User can create a new command and map it to a target state
- [ ] Input sequence validation (e.g. an empty sequence, or a state reference that doesn't exist) shows a clear inline error instead of saving an invalid command
- [ ] Command list reflects additions/edits/removals immediately in the in-memory model

## Notes
Cross-repo: needs `character` backlog item 036 (`.cmd` parsing) to load and round-trip existing command definitions.
