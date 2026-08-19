# Module: document
**Role:** In-memory representation of the currently loaded character — the WASM-parsed data, every supplied file's raw bytes, and now a pending sprite-edit overlay (`spriteEdits`, item 004) — the single place editor screens read from and write back to via shared patch/append helpers.
**Files:** `src/document/character-document.ts`
**Exports:** `getCharacterDocument(): CharacterDocument | null`, `setCharacterDocument(doc: LoadedCharacter | null): void`, `updateCharacterFields(patch: Partial<CharacterData>): void`, `addSpriteEdit(edit: SpriteEdit): void`, `resetCharacterDocumentForTests(): void`, `CharacterDocument`, `LoadedCharacter`
**Depends on:** `modules/wasm.md` (for `CharacterData`), `modules/input.md` (for `LoadedFileBytes`), `modules/sprites.md` (for `SpriteEdit`)
