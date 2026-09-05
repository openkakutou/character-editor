// Pure, DOM-free orchestration for Save/Export (backlog item 009): produces
// the byte buffers of every file this app can safely re-serialize from the
// in-memory CharacterDocument, or a clear reason why it can't yet.
//
// Scope is deliberately the same 6 file kinds `character-file-input.ts`
// already accepts (`.def`/`.air`/`.sff`/`.cns`/`.cmd`/`.zss`) -- not
// palettes (`.act`), which were never part of that loaded set to begin with
// (the palette editor already ships its own standalone "Save as .act"
// download). `.sff` itself is only ever passed through unchanged, and only
// when no sprite edits are pending: the `sff` library's WASM build has no
// encode/save call yet, so a pending sprite edit blocks export entirely
// rather than silently exporting a `.sff` that doesn't reflect it, or
// dropping the edit quietly. `.zss` is never edited (this app has no `.zss`
// editor) -- it is passed through byte-for-byte when supplied, omitted
// otherwise. See .vibe/decisions/009-export-scope-input-files-only-block-on-unwritable-sprite-edits.md.
import type { CharacterDocument } from "../document/character-document.ts";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import {
  type SaveResult,
  type WasmBridgeOptions,
  saveAir as defaultSaveAir,
  saveCmd as defaultSaveCmd,
  saveCns as defaultSaveCns,
  saveDef as defaultSaveDef,
} from "../wasm/bridge.ts";
import type {
  Animation,
  CharacterData,
  CharacterInfoFields,
  CommandFile,
  StateDef,
} from "../wasm/types.ts";

/** The file kinds Export can ever produce -- a subset of `FileKind` (no `sff`, since it's never reserialized). */
export type ExportFileKind = "def" | "air" | "cns" | "cmd" | "zss";

/** One file ready to be offered as a download. */
export interface ExportedFile {
  kind: ExportFileKind;
  fileName: string;
  bytes: Uint8Array;
  /** True when `bytes` is byte-for-byte identical to what was originally loaded (or, for `.zss`, always -- it is only ever passed through). */
  unchanged: boolean;
}

/** One or more pending sprite edits can't yet be written back to a `.sff` file -- see this module's own doc comment. */
export interface PendingSpriteEditsBlockedReason {
  kind: "pending-sprite-edits";
  edits: readonly SpriteEdit[];
}

/** A `saveX` WASM call itself rejected the edited data (e.g. a value out of the format's valid range). */
export interface SerializeErrorBlockedReason {
  kind: "serialize-error";
  fileKind: ExportFileKind;
  fileName: string;
  message: string;
}

export type ExportBlockedReason =
  | PendingSpriteEditsBlockedReason
  | SerializeErrorBlockedReason;

export type ExportResult =
  | { ok: true; files: ExportedFile[] }
  | { ok: false; reason: ExportBlockedReason };

export interface ExportOptions {
  /** Serializes `.def` bytes. Defaults to the real WASM bridge; injectable for testing. */
  saveDef?: (
    originalDefBytes: Uint8Array,
    info: CharacterInfoFields,
    options?: WasmBridgeOptions,
  ) => Promise<SaveResult>;
  /** Serializes `.air` bytes. Defaults to the real WASM bridge; injectable for testing. */
  saveAir?: (
    originalAirBytes: Uint8Array,
    animations: readonly Animation[],
    options?: WasmBridgeOptions,
  ) => Promise<SaveResult>;
  /** Serializes `.cns` bytes. Defaults to the real WASM bridge; injectable for testing. */
  saveCns?: (
    originalCnsBytes: Uint8Array,
    stateDefs: readonly StateDef[],
    options?: WasmBridgeOptions,
  ) => Promise<SaveResult>;
  /** Serializes `.cmd` bytes. Defaults to the real WASM bridge; injectable for testing. */
  saveCmd?: (
    originalCmdBytes: Uint8Array,
    commandFile: CommandFile,
    options?: WasmBridgeOptions,
  ) => Promise<SaveResult>;
  /** Forwarded to whichever default `saveX` wrappers aren't overridden; ignored for an overridden one. */
  bridgeOptions?: WasmBridgeOptions;
}

const DEFAULT_FILE_NAMES: Readonly<Record<ExportFileKind, string>> = {
  def: "character.def",
  air: "character.air",
  cns: "character.cns",
  cmd: "character.cmd",
  zss: "character.zss",
};

/** The last path segment of `path` (splitting on `/` or `\`), so a referenced field like `"anim/kfm.air"` yields a plain, download-safe file name. */
function baseName(referenced: string): string {
  const trimmed = referenced.trim();
  if (trimmed === "") return "";
  const segments = trimmed.split(/[/\\]/);
  return segments[segments.length - 1];
}

/** `kind`'s exported file name: the character's own referenced field when it names one, `DEFAULT_FILE_NAMES[kind]` otherwise. */
function fileNameFor(kind: ExportFileKind, referenced: string): string {
  const base = baseName(referenced);
  return base !== "" ? base : DEFAULT_FILE_NAMES[kind];
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const SPRITE_EDIT_VERBS: Readonly<Record<SpriteEdit["kind"], string>> = {
  add: "added",
  replace: "replaced",
  delete: "deleted",
};

/** A short, human-readable description of one pending sprite edit, for the blocked-export message. */
export function describeSpriteEdit(edit: SpriteEdit): string {
  return `sprite (group ${edit.group}, image ${edit.image}) ${SPRITE_EDIT_VERBS[edit.kind]}`;
}

function toCharacterInfoFields(character: CharacterData): CharacterInfoFields {
  return {
    name: character.name,
    author: character.author,
    spriteFile: character.spriteFile,
    animationFile: character.animationFile,
    soundFile: character.soundFile,
    commandFile: character.commandFile,
    constantsFile: character.constantsFile,
    stateFiles: character.stateFiles,
    palettes: character.palettes,
  };
}

/** Whether `.cmd` belongs in the export bundle at all: the character had one originally, or the user has added at least one command since. */
function shouldExportCmd(doc: CharacterDocument): boolean {
  return doc.files.cmd !== undefined || doc.commandFile.commands.length > 0;
}

function blockedBySerializeError(
  fileKind: ExportFileKind,
  fileName: string,
  message: string,
): ExportResult {
  return {
    ok: false,
    reason: { kind: "serialize-error", fileKind, fileName, message },
  };
}

/**
 * Computes every file Export can currently produce from `doc`, or the one
 * reason it can't. Sprite edits are checked first: if any are pending, this
 * returns blocked immediately without calling any `saveX` function at all
 * (see this module's own doc comment for why). Otherwise `.def`/`.air`/
 * `.cns` are always attempted, in that order, each one's failure stopping
 * the whole export (no partial/corrupt bundle) before the next is even
 * attempted; `.cmd` is attempted only when `shouldExportCmd` says it
 * belongs; `.zss` is never reserialized, only passed through when supplied.
 */
export async function exportCharacterFiles(
  doc: CharacterDocument,
  options: ExportOptions = {},
): Promise<ExportResult> {
  if (doc.spriteEdits.length > 0) {
    return {
      ok: false,
      reason: { kind: "pending-sprite-edits", edits: doc.spriteEdits },
    };
  }

  const saveDefFn = options.saveDef ?? defaultSaveDef;
  const saveAirFn = options.saveAir ?? defaultSaveAir;
  const saveCnsFn = options.saveCns ?? defaultSaveCns;
  const saveCmdFn = options.saveCmd ?? defaultSaveCmd;

  const defFileName = fileNameFor("def", "");
  const defResult = await saveDefFn(
    doc.files.def,
    toCharacterInfoFields(doc.character),
    options.bridgeOptions,
  );
  if (!defResult.ok) {
    return blockedBySerializeError("def", defFileName, defResult.error);
  }

  const airFileName = fileNameFor("air", doc.character.animationFile);
  const airResult = await saveAirFn(
    doc.files.air,
    doc.character.animations,
    options.bridgeOptions,
  );
  if (!airResult.ok) {
    return blockedBySerializeError("air", airFileName, airResult.error);
  }

  const cnsFileName = fileNameFor("cns", doc.character.constantsFile);
  const cnsResult = await saveCnsFn(
    doc.files.cns,
    doc.character.stateDefs,
    options.bridgeOptions,
  );
  if (!cnsResult.ok) {
    return blockedBySerializeError("cns", cnsFileName, cnsResult.error);
  }

  const files: ExportedFile[] = [
    {
      kind: "def",
      fileName: defFileName,
      bytes: defResult.bytes,
      unchanged: bytesEqual(defResult.bytes, doc.files.def),
    },
    {
      kind: "air",
      fileName: airFileName,
      bytes: airResult.bytes,
      unchanged: bytesEqual(airResult.bytes, doc.files.air),
    },
    {
      kind: "cns",
      fileName: cnsFileName,
      bytes: cnsResult.bytes,
      unchanged: bytesEqual(cnsResult.bytes, doc.files.cns),
    },
  ];

  if (shouldExportCmd(doc)) {
    const cmdFileName = fileNameFor("cmd", doc.character.commandFile);
    const originalCmdBytes = doc.files.cmd ?? new Uint8Array(0);
    const cmdResult = await saveCmdFn(
      originalCmdBytes,
      doc.commandFile,
      options.bridgeOptions,
    );
    if (!cmdResult.ok) {
      return blockedBySerializeError("cmd", cmdFileName, cmdResult.error);
    }
    files.push({
      kind: "cmd",
      fileName: cmdFileName,
      bytes: cmdResult.bytes,
      unchanged:
        doc.files.cmd !== undefined &&
        bytesEqual(cmdResult.bytes, doc.files.cmd),
    });
  }

  if (doc.files.zss) {
    files.push({
      kind: "zss",
      fileName: fileNameFor("zss", ""),
      bytes: doc.files.zss,
      unchanged: true,
    });
  }

  return { ok: true, files };
}
