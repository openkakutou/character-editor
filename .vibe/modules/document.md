# Module: document
**Role:** In-memory representation of the currently loaded character — the WASM-parsed data plus every supplied file's raw bytes — the single place editor screens (starting with the characteristics editor) read from and write back to via a shared field-patch helper.
**Files:** `src/document/character-document.ts`
**Exports:** `getCharacterDocument(): CharacterDocument | null`, `setCharacterDocument(doc): void`, `updateCharacterFields(patch: Partial<CharacterData>): void`, `resetCharacterDocumentForTests(): void`, `CharacterDocument`
**Depends on:** `modules/wasm.md` (for `CharacterData`), `modules/input.md` (for `LoadedFileBytes`)
