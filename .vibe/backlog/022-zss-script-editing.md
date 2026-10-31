---
status: todo
---
# View and edit .zss state scripts

## Description
The editor handles .cns controllers but not Ikemen GO .zss scripts, which character can now parse. Add a viewer/editor for Statedef/Function blocks with raw body editing, syntax-aware highlighting and parse-error feedback.

## Acceptance Criteria
- [ ] Open a character that uses .zss and browse its blocks
- [ ] Edit a block body, validate syntax, save byte-exact where unchanged
- [ ] Undo/redo integration

## Notes
Cross-repo: waits for character#060 (wire .zss into Character).
