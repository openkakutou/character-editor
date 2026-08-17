# Module: document
**Role:** In-memory representation of the currently loaded character — the WASM-parsed data plus every supplied file's raw bytes — the single place later editor screens (characteristics, sprites, palettes, animations, state logic, commands) read from and will eventually write back to.
**Files:** `src/document/character-document.ts`
**Exports:** `getCharacterDocument(): CharacterDocument | null`, `setCharacterDocument(doc): void`, `resetCharacterDocumentForTests(): void`, `CharacterDocument`
**Depends on:** `modules/wasm.md` (for `CharacterData`), `modules/input.md` (for `LoadedFileBytes`)
