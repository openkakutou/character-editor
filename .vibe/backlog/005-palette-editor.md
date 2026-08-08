---
status: todo
depends_on: [004]
---
# Palette Editor

## Description
Add a palette editing screen: edit an existing palette's colors, create a new palette from scratch or by duplicating one, and save the result as a `.act` file, using `web-ui-kit`'s color/palette picker component. Builds on the sprite browser (item 004) since palettes are previewed against the sprites they color.

## Acceptance Criteria
- [ ] User can edit individual colors of a loaded palette and see the change reflected live on a sprite preview
- [ ] User can create a new palette (blank or duplicated from an existing one)
- [ ] User can save a palette as a `.act` file
- [ ] Editing the transparent/index-0 color (or another reserved index) is either prevented or shows a clear warning, rather than silently producing a broken palette

## Notes
Cross-repo: needs `sff` backlog item 003 (palette write-path) to actually persist palette edits to disk.
