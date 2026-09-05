// Typed mirror of the JSON contract published by the `character` WASM
// module (`OpenKakutouCharacter.load`). Field names and shapes match the
// Go-side `json:"..."` tags exactly (character.Character, character/def's
// CharacterInfo fields threaded onto it). Unlike character-viewer-web's own
// copy of this type (a read-only viewer that only ever displays `name`),
// this editor app's `CharacterData` mirrors every field the WASM module
// returns — including author and the referenced-file-path metadata — since
// the later editor items (003-008) need to read and eventually write all of
// it. These are pure data types: no parsing/decoding logic lives here.

/** A frame's mirroring axis, matching the tokens used in `.air` files. */
export type Flip = "" | "H" | "V" | "HV";

/**
 * A frame's blending mode token as found in `.air` files (e.g. "A" for
 * additive, "S" for subtractive). Empty string means normal blending.
 */
export type BlendMode = string;

/** A `.cns` [Statedef N] block's "type" parameter. */
export type StateType = "S" | "C" | "A" | "L" | "U";

/** A `.cns` [Statedef N] block's "movetype" parameter. */
export type MoveType = "A" | "I" | "H" | "U";

/** A `.cns` [Statedef N] block's "physics" parameter. */
export type PhysicsType = "S" | "C" | "A" | "N" | "U";

/** An axis-aligned collision box (Clsn1/Clsn2 coordinate system). */
export interface ClsnBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A single displayed image within an Animation. */
export interface Frame {
  group: number;
  image: number;
  x: number;
  y: number;
  time: number;
  flip: Flip;
  blend: BlendMode;
  clsn1: ClsnBox[];
  clsn2: ClsnBox[];
}

/** One `.air` `[Begin Action N]` block. */
export interface Animation {
  number: number;
  frames: Frame[];
  loopStart: number;
}

/** One sprite within a `.sff` sprite group. */
export interface Sprite {
  group: number;
  image: number;
  width: number;
  height: number;
  axisX: number;
  axisY: number;
  palette: number;
}

/** A group of sprites sharing the same `.sff` group index. */
export interface SpriteGroup {
  index: number;
  sprites: Sprite[];
}

/** A `.cns` state controller, stored as unevaluated trigger/parameter data. */
export interface Controller {
  type: string;
  triggers: string[];
  parameters: Record<string, string>;
}

/** One `.cns` `[Statedef N]` block plus its controllers. */
export interface StateDef {
  number: number;
  type: StateType;
  moveType: MoveType;
  physics: PhysicsType;
  anim: number;
  ctrl: boolean;
  powerAdd: number;
  juggle: number;
  faceP2: boolean;
  hitDefPersist: boolean;
  moveHitPersist: boolean;
  hitCountPersist: boolean;
  sprPriority: number;
  controllers: Controller[];
}

/**
 * The full character graph returned by `OpenKakutouCharacter.load`,
 * including the `.def` [Info]/[Files] metadata (`character`'s own
 * `LoadBytes`/item 038) that character-viewer-web's read-only `CharacterData`
 * copy doesn't yet expose.
 */
export interface CharacterData {
  name: string;
  author: string;
  spriteFile: string;
  animationFile: string;
  soundFile: string;
  commandFile: string;
  constantsFile: string;
  stateFiles: string[];
  palettes: string[];
  animations: Animation[];
  sprites: SpriteGroup[];
  stateDefs: StateDef[];
}

/** A `.cmd` file's file-level command-recognition defaults (`[Defaults]`). */
export interface CommandDefaults {
  time: number;
  bufferTime: number;
}

/** A single `.cmd` `[Command]` section: a named input sequence a player can perform. */
export interface Command {
  name: string;
  /** The raw, unevaluated MUGEN/Ikemen input-sequence expression (e.g. `"~D, DF, F, a"`), stored verbatim. */
  input: string;
  /** This command's own recognition-window override; 0 means "not set" (falls back to `CommandFile.defaults.time`). */
  time: number;
  /** This command's own recognized-duration override; 0 means "not set" (falls back to `CommandFile.defaults.bufferTime`). */
  bufferTime: number;
}

/**
 * A MUGEN/Ikemen GO input command (`.cmd`) file: optional button remapping,
 * file-level recognition defaults, the input command definitions
 * themselves, and the linked "always" state (`[Statedef -1]` and its
 * `[State ...]` controllers) that reacts to a recognized command. `.cmd`
 * isn't wired into `CharacterData` (see `character`'s own `ParseCmd`/
 * `loadCmd` doc comments), so this is parsed separately via `loadCmd`.
 */
export interface CommandFile {
  /** Physical button -> remapped button (e.g. `{ x: "y" }`); empty when the file defines no remapping. */
  remap: Record<string, string>;
  defaults: CommandDefaults;
  commands: Command[];
  /** The `[Statedef -1]` block's StateDefs, parsed via the same model as `CharacterData.stateDefs`. */
  states: StateDef[];
}

/**
 * Result of the typed bridge wrapper: exactly one of `character`/`error` is
 * ever meaningful, mirroring the WASM module's own `{character, error}`
 * contract one level up in TypeScript, as a discriminated union instead of
 * a thrown exception.
 */
export type CharacterResult =
  | { ok: true; character: CharacterData }
  | { ok: false; error: string };
