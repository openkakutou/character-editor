---
status: todo
depends_on: [004]
---
# Animation Editor

## Description
Add a screen to create and edit `.air` animations: sequences of frames, each referencing a sprite (group/image) with a display duration, plus Clsn1/Clsn2 (hurtbox/hitbox) boxes per frame. Uses `web-ui-kit`'s canvas/viewport controls to overlay and drag-resize Clsn boxes on the sprite preview, and the sprite browser (item 004) to pick sprite references.

## Acceptance Criteria
- [ ] User can create a new animation and add/remove/reorder frames
- [ ] Each frame's sprite reference and display duration are editable
- [ ] Clsn1/Clsn2 boxes are addable, draggable/resizable, and deletable per frame, with a live preview overlay
- [ ] Animation playback preview (play/pause/step) reflects the edited frame sequence
- [ ] A frame referencing a sprite group/image that doesn't exist in the loaded sprite sheet shows a clear inline warning instead of silently rendering a blank frame

## Notes
None.
