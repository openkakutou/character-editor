# Module: palettes
**Role:** The palette editor (backlog item 005): edit a 256-color palette's colors, start a new one (blank or duplicated), load/save it as a `.act` file, with a live-recolored sprite preview. Stores colors in semantic MUGEN index order, converting to/from `.act` file-byte order via one shared involution — see `.vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md`.
**Files:** `src/palettes/palette.ts`, `src/palettes/palette-editor.ts`
**Exports:**
- `Color`, `PALETTE_COLOR_COUNT`, `PALETTE_BYTE_LENGTH`, `RESERVED_INDEX`, `blankPalette()`, `duplicatePalette(source)`, `colorAt(palette, index)`, `withColor(palette, index, color)`, `isReservedIndex(index)`, `reversePaletteByteOrder(bytes)`, `parseActBytes(raw): ParseActResult`, `serializeActBytes(palette)`, `colorToHex(color)`, `hexToColor(hex)` — DOM-free pure logic (palette.ts)
- `PaletteEditorOptions`, `renderPaletteEditor(root, character, sffBytes, options?): void`, `defaultReadFileBytes(file)`, `defaultTriggerDownload(bytes, fileName)` (palette-editor.ts)
**Depends on:** `modules/wasm.md` (`resolveSpritePixels`, `CharacterData`), `modules/sprites.md` (reuses `defaultDrawPixels`), `@openkakutou/web-ui-kit` (`<wuik-color-picker>`, `<wuik-button>`, `<wuik-panel>`)
