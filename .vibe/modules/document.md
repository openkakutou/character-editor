# Module: document
**Role:** In-memory representation of the currently loaded character — the WASM-parsed data, every supplied file's raw bytes, a pending sprite-edit overlay (`spriteEdits`, item 004), and now the command editor's latest committed `.cmd` model (`commandFile`, item 008) — the single place editor screens read from and write back to via shared patch/append helpers.
**Files:** `src/document/character-document.ts`
**Exports:** `getCharacterDocument(): CharacterDocument | null`, `setCharacterDocument(doc: LoadedCharacter | null): void`, `updateCharacterFields(patch: Partial<CharacterData>): void`, `addSpriteEdit(edit: SpriteEdit): void`, `setCommandFile(commandFile: CommandFile): void`, `resetCharacterDocumentForTests(): void`, `CharacterDocument`, `LoadedCharacter`
**Depends on:** `modules/wasm.md` (for `CharacterData`/`CommandFile`), `modules/input.md` (for `LoadedFileBytes`), `modules/sprites.md` (for `SpriteEdit`), `modules/commands.md` (for `emptyCommandFile`)
