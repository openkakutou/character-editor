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
The in-memory representation of the currently loaded character: the parsed data, every supplied file's raw bytes, and pending sprite edits.

| Field | Type | Notes |
|---|---|---|
| character | CharacterData | |
| files | LoadedFileBytes | Raw bytes per file kind, required kinds always present |
| spriteEdits | SpriteEdit[] | Pending sprite add/replace/delete edits (item 004); always reset to `[]` on a fresh load |

Defined in: `src/document/character-document.ts`

## SpriteEdit
A pending sprite browser edit against the WASM-parsed sprite list — never written back into `CharacterData` itself. `AddOrReplaceSpriteEdit` carries the already-decoded image to preview; `DeleteSpriteEdit` carries nothing beyond the sprite reference.

| Field | Type | Notes |
|---|---|---|
| kind | "add" \| "replace" \| "delete" | Discriminant |
| group, image | number | The `.sff` sprite reference this edit targets |
| pixels | Uint8Array | `add`/`replace` only — flat RGBA, straight alpha |
| width, height | number | `add`/`replace` only |

Defined in: `src/sprites/sprite-edits.ts`

## FileSlots / CompleteFileSlots / LoadedFileBytes
The character file input's accumulating state: one optional `File` slot per accepted kind (`def`/`air`/`sff`/`cns`/`cmd`/`zss`). `CompleteFileSlots` narrows this once the 4 required kinds are present (optional kinds may still be absent). `LoadedFileBytes` is the byte-buffer equivalent, produced after reading every filled slot.

Defined in: `src/input/character-file-input.ts`

## CharacterResult / CharacterInputResult
Discriminated-union results instead of thrown exceptions. `CharacterResult` is the WASM bridge's own `{ok: true, character} | {ok: false, error}`. `CharacterInputResult` wraps it one layer up: `{status: "success", character, files} | {status: "read-error", error} | {status: "bridge-error", message}`.

Defined in: `src/wasm/types.ts`, `src/input/character-file-input.ts`

## Color
An RGB triplet (`{r, g, b}`, 0-255 each) — a palette editor color, no alpha channel: `.act` files carry none.

Defined in: `src/palettes/palette.ts`

## ParseActResult
A discriminated-union result instead of a thrown exception for `.act` file parsing: `{ok: true, palette: Uint8Array} | {ok: false, error: string}`. `palette` is 768 bytes in semantic MUGEN index order (never raw file order) — see `.vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md`.

Defined in: `src/palettes/palette.ts`
