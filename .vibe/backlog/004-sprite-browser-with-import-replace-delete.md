---
status: todo
depends_on: [002]
---
# Sprite Browser With Import/Replace/Delete

## Description
Add a sprite browser screen (grid/list of the character's sprites, grouped by group/image number) that goes beyond `character-viewer-web`'s read-only browsing: the user can import a new image as a sprite, replace an existing sprite's pixel data, and delete a sprite from the sheet. Uses `web-ui-kit`'s canvas/viewport controls for zoom/pan on individual sprite previews.

## Acceptance Criteria
- [ ] All sprites in the loaded `.sff` are browsable, grouped by group/image number, with zoom/pan preview
- [ ] User can import a new image file and add it as a new sprite
- [ ] User can replace an existing sprite's pixel data with a new image
- [ ] User can delete a sprite, with animations/state logic referencing it left intact but visibly flagged as now referencing a missing sprite
- [ ] An imported image in an unsupported format/color depth shows a clear error instead of corrupting the sprite sheet in memory

## Notes
Cross-repo: needs `sff` backlog item 002 (v2 pixel encode) to actually save import/replace/delete changes back to a `.sff` file — until then, edits can be made in the in-memory model but not persisted.
