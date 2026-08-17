# Module: wasm
**Role:** Bridge to the `character` WebAssembly module — loads it client-side and exposes a typed `loadCharacter` wrapper, scoped to loading only (later editor items add their own wrappers around the module's `save*` globals as needed).
**Files:** `src/wasm/bridge.ts`, `src/wasm/types.ts`
**Exports:** `loadCharacter(defBytes, airBytes, sffBytes, cnsBytes, options?): Promise<CharacterResult>`, `resetWasmBridgeForTests(): void`, `WasmBridgeOptions`, `CharacterData`, `CharacterResult`, `Animation`, `Frame`, `ClsnBox`, `Sprite`, `SpriteGroup`, `Controller`, `StateDef`
**Depends on:** the `character.wasm` + `wasm_exec.js` build fetched into `public/wasm/` (gitignored, via `scripts/download-wasm.mjs`)
