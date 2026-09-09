---
date: 2026-09-09
status: accepted
---
# The new-character wizard builds a character via saveX + loadCharacter, not a hand-built CharacterData

**Context:** Item 010's wizard must produce "a valid minimal character (loadable by the editors)" from a blank template or a preset, without a `sff` WASM encode path (sprite files can't be synthesized — see `.vibe/decisions/004`/`009`).

**Decision:** The wizard builds `CharacterInfoFields`/`Animation[]`/`StateDef[]`/`CommandFile` JS objects for the chosen template, calls the `character` WASM module's `saveDef`/`saveAir`/`saveCns`/`saveCmd` with an empty `Uint8Array` as each "original bytes" argument (a case those calls already document supporting: "an empty array for a brand new character with no original file yet"), pairs the result with a small bundled minimal `.sff` asset (`public/wizard/blank-character.sff`, a copy of the existing `v1-basic.sff` test fixture), and feeds all four resulting byte buffers through the exact same `loadCharacter` call the file-input path uses. The resulting `{character, files}` is handed to the same `onLoaded`-shaped callback as an import, so a wizard-created character is indistinguishable from an imported one everywhere else in the app.

**Reason:** Round-tripping through the real WASM serialize-then-parse path is the only way to guarantee the acceptance criterion's exact wording ("loadable by the editors") without duplicating `character`'s own `.def`/`.air`/`.cns`/`.cmd` text-format knowledge in TypeScript. It also means any format detail this app doesn't need to know about (default field ordering, section formatting) is handled identically to every other save, and a future `sff` encode path can replace the bundled asset with a truly synthesized one without changing this module's shape.

**Rejected alternatives:** Hand-writing minimal `.def`/`.air`/`.cns`/`.cmd` text templates as string literals in TypeScript — rejected: duplicates format knowledge that already lives in `character`, and risks drifting from what `character`'s own parser actually accepts. Blocking the wizard entirely until `sff` gets a real encode path — rejected: the acceptance criterion doesn't require a synthesized sprite sheet, only a loadable minimal character, and a bundled placeholder `.sff` satisfies that today.
