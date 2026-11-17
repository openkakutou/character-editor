---
status: todo
---
# Preview and edit 3D character actions

## Description
Roadmap decision `028` adds OpenKakutou-exclusive 3D characters. The action editor must display 3D frames (`.glb` clip + time) through `web-ui-kit`'s shared 3D viewport, and let the user set a frame's clip and time as it already sets `(group, image)` for sprite frames. Facing previews as a 180° rotation, palettes as `KHR_materials_variants`.

Blocked on `character` items 070 (parsing) and 071 (sample fixture).

## Acceptance Criteria
- [ ] Opening the `character` 071 sample shows its 3D actions animated with correct durations
- [ ] Clip and time of a 3D frame are editable and saved
- [ ] Sprite and 3D frames in one action both render; facing flip rotates the model
- [ ] Palette selection switches material variant
