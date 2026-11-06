---
date: 2026-11-06
status: accepted
---
# Sound edits are an in-memory log replayed through the snd WASM module

**Context:** Backlog item 023 adds import, replace and delete of sounds, with format validation and a valid `.snd` on export. `character`'s WASM build (v0.10.0) exposes the decoded sounds but no write path; `snd` v0.7.1 publishes its own WASM build with `addSound`, `replaceSound`, `removeSound` and `decode`.

**Decision:** The app loads `snd.wasm` itself (`src/wasm/snd-bridge.ts`, its own `wasm_exec.js` under `public/wasm/snd/`, pinned in `deploy-pages.yml`). Edits are an ordered log (`CharacterDocument.soundEdits`, one undo step each), not a latest-per-sound map: Export replays the log on the original `.snd` bytes and writes the result as a new `.snd` file; with no edit the file is passed through untouched. Each request is first applied to the file as it stands with the pending edits, so the module itself decides whether the audio (plain 8/16-bit PCM WAV, never converted), the key and the file are acceptable, and the new sound is decoded back from the edited file for preview. Deleting asks for a confirm and states how many `PlaySnd` controllers use the sound exactly (`value = group, sample`), and how many pick their sound with an expression; `F`-prefixed values (common sound file) are not counted. The `.snd` joins the export bundle only when the character had one.

**Reason:** Reusing `snd`'s own validation avoids a second copy of the audio rules in TypeScript. An ordered log keeps an add followed by a replace valid when replayed; a latest-per-key map would turn it into a replace of a sound the file does not have. Editing stays unavailable when the `.snd` failed to load or the character has none: creating one also needs a `.def` change, out of scope.

**Rejected alternatives:** Waiting for `character` to expose sound editing (another release cycle for no gain: the editor already needs `snd.wasm` for validation anyway). Decoding and validating WAV in TypeScript (duplicates `snd`'s rule). Latest-per-key edit overlay like sprites (breaks replay). Blocking deletion of a used sound (the user may be about to fix the states; a warning and a confirm match the sprite browser).
