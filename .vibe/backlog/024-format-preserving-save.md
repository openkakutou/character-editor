---
status: todo
---
# Save modified files without losing comments and ordering

## Description
Export is byte-exact only for untouched files. Adopt character's format-preserving edits once available so edited files keep their comments and layout.

## Acceptance Criteria
- [ ] Edited files retain untouched comments and ordering
- [ ] Regression test with a real commented character
- [ ] No behavioural change for unmodified files

## Notes
Cross-repo: waits for character#061.
