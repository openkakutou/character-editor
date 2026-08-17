# Data models

## CharacterData
The full character graph returned by the `character` WASM module's `OpenKakutouCharacter.load`, including `.def` `[Info]`/`[Files]` metadata.

| Field | Type | Notes |
|---|---|---|
| name | string | |
| author | string | Empty when the source `.def` doesn't set it |
| spriteFile | string | Referenced `.sff` path, metadata only |
| animationFile | string | Referenced `.air` path, metadata only |
| soundFile | string | Referenced `.snd` path, metadata only |
| commandFile | string | Referenced `.cmd` path, metadata only |
| constantsFile | string | Referenced `.cns` path, metadata only |
| stateFiles | string[] | Additional `.st` files |
| palettes | string[] | `.act` palette files |
| animations | Animation[] | |
| sprites | SpriteGroup[] | |
| stateDefs | StateDef[] | |

Defined in: `src/wasm/types.ts`

## CharacterDocument
The in-memory representation of the currently loaded character: the parsed data plus every supplied file's raw bytes.

| Field | Type | Notes |
|---|---|---|
| character | CharacterData | |
| files | LoadedFileBytes | Raw bytes per file kind, required kinds always present |

Defined in: `src/document/character-document.ts`

## FileSlots / CompleteFileSlots / LoadedFileBytes
The character file input's accumulating state: one optional `File` slot per accepted kind (`def`/`air`/`sff`/`cns`/`cmd`/`zss`). `CompleteFileSlots` narrows this once the 4 required kinds are present (optional kinds may still be absent). `LoadedFileBytes` is the byte-buffer equivalent, produced after reading every filled slot.

Defined in: `src/input/character-file-input.ts`

## CharacterResult / CharacterInputResult
Discriminated-union results instead of thrown exceptions. `CharacterResult` is the WASM bridge's own `{ok: true, character} | {ok: false, error}`. `CharacterInputResult` wraps it one layer up: `{status: "success", character, files} | {status: "read-error", error} | {status: "bridge-error", message}`.

Defined in: `src/wasm/types.ts`, `src/input/character-file-input.ts`
