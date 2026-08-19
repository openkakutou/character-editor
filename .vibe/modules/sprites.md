# Module: sprites
**Role:** The sprite browser (backlog item 004): browse every sprite group/image with a zoom/pan preview, import a new image as a sprite, replace an existing one's pixels, or delete one — against an in-memory edit overlay, not yet persisted to a real `.sff` file (see `.vibe/decisions/004-sprite-edits-in-memory-overlay-not-persisted.md`).
**Files:** `src/sprites/sprite-edits.ts`, `src/sprites/image-decode.ts`, `src/sprites/sprite-browser.ts`
**Exports:**
- `SpriteEdit`, `AddOrReplaceSpriteEdit`, `DeleteSpriteEdit` (sprite-edits.ts) — the pending-edit union type
- `applySpriteEdit(edits, edit): SpriteEdit[]`, `mergeSpriteGroups(baseGroups, edits): SpriteGroup[]`, `spriteEditFor(edits, ref)`, `nextAvailableImageIndex(group)`, `nextAvailableGroupIndex(groups)`, `countReferencingFrames(animations, group, image): number` — DOM-free pure logic (sprite-edits.ts)
- `DecodedImage`, `ImageDecodeResult`, `ImageDecodeOptions`, `decodeImageFile(file, options?): Promise<ImageDecodeResult>` (image-decode.ts)
- `SpriteBrowserOptions`, `renderSpriteBrowser(root, character, sffBytes, spriteEdits, options?): void`, `defaultDrawPixels(canvas, pixels, width, height): void` (sprite-browser.ts)
**Depends on:** `modules/wasm.md` (`resolveSpritePixels`, `CharacterData`), `@openkakutou/web-ui-kit` (`<wuik-viewport>`, `<wuik-button>`, `<wuik-panel>`)
