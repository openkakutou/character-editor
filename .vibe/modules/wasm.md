# Module: wasm
**Role:** Bridge to the `character` WebAssembly module — loads it client-side and exposes typed wrappers around `OpenKakutouCharacter.load` (`loadCharacter`) and `resolveSprites` (`resolveSpritePixels`, item 004's sprite pixel decoding). Later editor items add their own wrappers around the module's `save*` globals as needed.
**Files:** `src/wasm/bridge.ts`, `src/wasm/types.ts`
**Exports:** `loadCharacter(defBytes, airBytes, sffBytes, cnsBytes, options?): Promise<CharacterResult>`, `resolveSpritePixels(sffBytes, requests, overridePaletteBytes, options?): Promise<SpritePixelResult[]>`, `resetWasmBridgeForTests(): void`, `WasmBridgeOptions`, `CharacterData`, `CharacterResult`, `SpritePixelResult`, `Animation`, `Frame`, `ClsnBox`, `Sprite`, `SpriteGroup`, `Controller`, `StateDef`
**Depends on:** the `character.wasm` + `wasm_exec.js` build fetched into `public/wasm/` (gitignored, via `scripts/download-wasm.mjs`)
