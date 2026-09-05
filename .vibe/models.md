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
The in-memory representation of the currently loaded character: the parsed data, every supplied file's raw bytes, pending sprite edits, and the command editor's latest committed `.cmd` model.

| Field | Type | Notes |
|---|---|---|
| character | CharacterData | |
| files | LoadedFileBytes | Raw bytes per file kind, required kinds always present |
| spriteEdits | SpriteEdit[] | Pending sprite add/replace/delete edits (item 004); always reset to `[]` on a fresh load |
| commandFile | CommandFile | The command editor's latest commit (item 008); write-only from that editor's own perspective, always reset to `emptyCommandFile()` on a fresh load |

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

## StateDef / Controller
A `.cns` `[Statedef N]` block plus its ordered Controllers. `Controller`'s `type`/`triggers`/`parameters` are unevaluated data (`character/cns`'s own model) this app only edits, never interprets — none of them can ever fail to parse; a blank `type` is the one shape `state-editor.ts` flags as unsupported (see `.vibe/decisions/006`).

| Type | Field | Type | Notes |
|---|---|---|---|
| StateDef | number | number | The `[Statedef N]` identifier |
| StateDef | type / moveType / physics | StateType / MoveType / PhysicsType | Header classification fields; read-only in this app's editor |
| StateDef | anim, ctrl, powerAdd, juggle, faceP2, hitDefPersist, moveHitPersist, hitCountPersist, sprPriority | various | Other header fields; read-only in this app's editor |
| StateDef | controllers | Controller[] | In file order |
| Controller | type | string | The controller's declared type (e.g. `"ChangeState"`); blank means unsupported (see above) |
| Controller | triggers | string[] | Unevaluated trigger-condition strings, in file order |
| Controller | parameters | Record\<string, string\> | Unevaluated key/value pairs |

Defined in: `src/wasm/types.ts`

## ParseActResult
A discriminated-union result instead of a thrown exception for `.act` file parsing: `{ok: true, palette: Uint8Array} | {ok: false, error: string}`. `palette` is 768 bytes in semantic MUGEN index order (never raw file order) — see `.vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md`.

Defined in: `src/palettes/palette.ts`

## Animation / Frame / ClsnBox
A `.air` `[Begin Action N]` block (`Animation`), its ordered Frames, and each Frame's Clsn1/Clsn2 collision boxes — edited by `animations` (backlog item 006). Every field round-trips as-is; this app never resolves a Frame's sprite reference against real pixels except for its own live preview.

| Type | Field | Type | Notes |
|---|---|---|---|
| Animation | number | number | The `[Begin Action N]` identifier |
| Animation | frames | Frame[] | In file order |
| Animation | loopStart | number | Index playback loops back to once past the last frame |
| Frame | group, image | number | The Sprite this frame displays |
| Frame | x, y | number | Display offset |
| Frame | time | number | Duration in ticks; non-positive means "hold indefinitely" (MUGEN convention) — see `animation-playback.ts`'s `advanceFrame` |
| Frame | flip | Flip (`""` \| `"H"` \| `"V"` \| `"HV"`) | Mirroring axis |
| Frame | blend | BlendMode (string) | Blend mode token, e.g. `"A"` for additive |
| Frame | clsn1, clsn2 | ClsnBox[] | Hit boxes / hurt boxes, editable in `animations`' Clsn editor |
| ClsnBox | left, top, right, bottom | number | Axis-aligned box in the sprite's own pixel coordinates, always integers once committed by `animations` (see `.vibe/decisions/007`) |

Defined in: `src/wasm/types.ts`

## CommandFile / Command / CommandDefaults
A `.cmd` file's model, parsed separately from `CharacterData` via `wasm.loadCmd` since `.cmd` isn't wired into the `load` JSON contract (item 008). A command's link to a target state is not a dedicated field — it flows through a `ChangeState` Controller inside `states`, triggered by `command = "<name>"` (see `.vibe/decisions/008-command-editor-state-link-and-validation-scope.md`).

| Type | Field | Type | Notes |
|---|---|---|---|
| CommandFile | remap | Record\<string, string\> | Physical button -> remapped button; empty when the file defines none |
| CommandFile | defaults | CommandDefaults | File-level recognition-window fallback |
| CommandFile | commands | Command[] | In file order |
| CommandFile | states | StateDef[] | The `[Statedef -1]` block, same model as `CharacterData.stateDefs` |
| CommandDefaults | time, bufferTime | number | Fallback recognition window a Command uses when its own is unset (0) |
| Command | name | string | Referenced by its linked ChangeState controller's trigger; required and unique in this app's editor |
| Command | input | string | Raw, unevaluated MUGEN input-sequence expression (e.g. `"~D, DF, F, a"`), stored verbatim |
| Command | time, bufferTime | number | This command's own recognition-window override; 0 means "not set" |

Defined in: `src/wasm/types.ts`
