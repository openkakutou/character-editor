---
status: in_progress
depends_on: [001]
---
# Character File Input (For Editing)

## Description
Since this is a static site with no backend, the user must supply a character's files directly from their machine to edit them. Add a file input (standard multi-file picker and/or drag-and-drop) that lets the user select or drop a character's `.def`/`.air`/`.sff`/`.cns`/`.cmd`/`.zss` files, reads each as a byte buffer, and feeds them into the `character`/`sff` WASM bridges. This is a superset of `character-viewer-web`'s read-only file input: it also accepts `.cmd` and `.zss`, since the editor needs to write those back later.

## Acceptance Criteria
- [ ] User can select the character's files via a file picker, or drag-and-drop them onto a drop zone
- [ ] Selected files are read as byte buffers and passed to the WASM bridges' load calls
- [ ] A missing required file shows a clear error state naming which file is missing, instead of calling the bridge with incomplete data
- [ ] An unreadable/corrupt file selection shows a clear error state instead of crashing the page
- [ ] Loaded file contents are held in memory in a form the later editors (items 003-008) can read from and write back to, not just displayed once

## Notes
None.
