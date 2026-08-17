# Module: editors
**Role:** Screens that edit an already-loaded character. `characteristics-editor.ts` (item 003) is the first: a form for identity, referenced-file-path, and list (state files, palettes) fields, committing every edit via an injected `onChange` callback rather than touching the document store directly.
**Files:** `src/editors/characteristics-editor.ts`
**Exports:** `renderCharacteristicsEditor(root, character, options): void`, `CharacteristicsEditorOptions`
**Depends on:** `modules/wasm.md` (for `CharacterData`)
