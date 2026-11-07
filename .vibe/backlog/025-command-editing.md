---
status: todo
---
# Command Editing

## Description
The editor cannot edit .cmd files, so special-move inputs cannot be changed. Add a Commands editor: list, add, remove, edit command name, input sequence, time and buffer values, with validation and undo.

## Acceptance Criteria
- [ ] User can add, edit and remove a command, and the exported .cmd reflects it
- [ ] An invalid input sequence is flagged with a clear message and blocks export of that command
- [ ] Edits are undoable and redoable
- [ ] Untouched commands keep their text byte-exact on export

## Notes
Needs character 059 (wire .cmd into Character) and ideally 061 (format-preserving edits). Related: 022 (zss) and 024 (format-preserving save).
