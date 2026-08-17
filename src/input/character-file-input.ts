// Pure, DOM-free logic for gathering a character's files across any number
// of picker/drop gestures and feeding the completed set to the `character`
// WASM bridge. Extends character-viewer-web's own 4-required-file
// accumulating-slots model (see its .vibe/decisions/004) with 2 additional
// OPTIONAL kinds (`.cmd`/`.zss`) this editor also accepts but does not yet
// parse — see .vibe/decisions/002-required-vs-optional-input-files-and-in-memory-document.md
// for why the split is required-vs-optional rather than all-required.
import { loadCharacter } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";

/** The 4 file kinds the WASM `load` call itself requires to produce a character. */
export type RequiredFileKind = "def" | "air" | "sff" | "cns";

/**
 * The 2 file kinds this editor additionally accepts but does not parse yet
 * — the WASM boundary has no parse call for them (only a later `save*` call
 * needing already-edited data this item doesn't produce). Their raw bytes
 * are simply captured for later editor items (008's command editor) to use.
 */
export type OptionalFileKind = "cmd" | "zss";

export type FileKind = RequiredFileKind | OptionalFileKind;

/** Stable display/processing order for the 4 required kinds. */
export const REQUIRED_FILE_KINDS: readonly RequiredFileKind[] = [
  "def",
  "air",
  "sff",
  "cns",
];

/** Stable display/processing order for the 2 optional kinds. */
export const OPTIONAL_FILE_KINDS: readonly OptionalFileKind[] = ["cmd", "zss"];

/** Every accepted kind, required first — the single source of slot order/config. */
export const ALL_FILE_KINDS: readonly FileKind[] = [
  ...REQUIRED_FILE_KINDS,
  ...OPTIONAL_FILE_KINDS,
];

/** The filename extension (including the dot) matched for each accepted kind. */
export const EXTENSION_BY_KIND: Readonly<Record<FileKind, string>> = {
  def: ".def",
  air: ".air",
  sff: ".sff",
  cns: ".cns",
  cmd: ".cmd",
  zss: ".zss",
};

/** Files gathered so far, one optional slot per accepted kind. */
export type FileSlots = Partial<Record<FileKind, File>>;

/** `FileSlots` once every required kind has a file; optional kinds may still be absent. */
export type CompleteFileSlots = Record<RequiredFileKind, File> &
  Partial<Record<OptionalFileKind, File>>;

/** Two or more files of the same kind given in a single `mergeFiles` call. */
export interface DuplicateKindError {
  kind: FileKind;
  fileNames: string[];
}

export interface MergeFilesResult {
  /** Updated slots: unrecognized files are dropped, duplicate kinds leave their slot untouched. */
  slots: FileSlots;
  /** Files that matched none of the 6 accepted extensions. */
  ignored: File[];
  /** Kinds for which this call supplied more than one file at once. */
  duplicates: DuplicateKindError[];
}

function classify(file: File): FileKind | null {
  const lowerName = file.name.toLowerCase();
  return (
    ALL_FILE_KINDS.find((kind) =>
      lowerName.endsWith(EXTENSION_BY_KIND[kind]),
    ) ?? null
  );
}

/**
 * Merges newly picked/dropped files into the existing slots.
 *
 * - A file matching an accepted extension for a kind with no file yet, or a
 *   single file for a kind already filled, fills/replaces that slot — this
 *   is how a user corrects a single bad file without redoing the others.
 * - Two or more files matching the *same* kind within this one call are
 *   reported as a duplicate instead of silently picking one; that slot is
 *   left as it was. This applies to optional kinds too — a user dropping
 *   two `.cmd` files is still an ambiguous input, even though `.cmd` isn't
 *   required.
 * - Files matching none of the 6 accepted extensions are reported as ignored.
 */
export function mergeFiles(
  current: FileSlots,
  incoming: File[],
): MergeFilesResult {
  const byKind = new Map<FileKind, File[]>();
  const ignored: File[] = [];

  for (const file of incoming) {
    const kind = classify(file);
    if (kind === null) {
      ignored.push(file);
      continue;
    }
    const list = byKind.get(kind);
    if (list) {
      list.push(file);
    } else {
      byKind.set(kind, [file]);
    }
  }

  const duplicates: DuplicateKindError[] = [];
  const slots: FileSlots = { ...current };

  for (const [kind, files] of byKind) {
    if (files.length > 1) {
      duplicates.push({ kind, fileNames: files.map((file) => file.name) });
      continue;
    }
    slots[kind] = files[0];
  }

  return { slots, ignored, duplicates };
}

/** Required kinds not yet present in `slots`, in display order. Optional kinds never appear here. */
export function missingRequiredKinds(slots: FileSlots): RequiredFileKind[] {
  return REQUIRED_FILE_KINDS.filter((kind) => slots[kind] === undefined);
}

/** True once every required kind has a file, narrowing `slots` to `CompleteFileSlots`. Optional kinds may still be missing. */
export function isComplete(slots: FileSlots): slots is CompleteFileSlots {
  return missingRequiredKinds(slots).length === 0;
}

/** A specific file's bytes could not be read (e.g. an unreadable/corrupt selection). */
export interface FileReadError {
  kind: FileKind;
  fileName: string;
  message: string;
}

/** Raw bytes read for every slot actually supplied — required kinds always present, optional kinds only when given. */
export type LoadedFileBytes = Record<RequiredFileKind, Uint8Array> &
  Partial<Record<OptionalFileKind, Uint8Array>>;

/**
 * Outcome of reading the supplied files and passing the 4 required ones to
 * the WASM bridge. `files` carries the raw bytes of every slot that was
 * actually filled (required and optional alike) so later editor items
 * (003-008) can read from — and eventually write back to — the exact bytes
 * the user supplied, not just the WASM-parsed subset.
 */
export type CharacterInputResult =
  | { status: "success"; character: CharacterData; files: LoadedFileBytes }
  | { status: "read-error"; error: FileReadError }
  | { status: "bridge-error"; message: string };

/**
 * Reads a File's bytes via `FileReader` rather than `Blob#arrayBuffer()` —
 * unlike `arrayBuffer()` (unimplemented in jsdom as of this writing),
 * `FileReader` behaves identically in a real browser and under jsdom/Node.
 */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else {
        reject(new Error("FileReader did not return an ArrayBuffer"));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("failed to read file"));
    };
    reader.readAsArrayBuffer(file);
  });
}

export interface CharacterFileInputOptions extends WasmBridgeOptions {
  /** Reads a File's bytes. Defaults to `readFileAsBytes`; injectable for testing failure paths. */
  readFileBytes?: (file: File) => Promise<Uint8Array>;
}

async function readSlotBytes(
  kind: FileKind,
  file: File,
  readFileBytes: (file: File) => Promise<Uint8Array>,
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; error: FileReadError }
> {
  try {
    const bytes = await readFileBytes(file);
    return { ok: true, bytes };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind,
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Reads every supplied file (the 4 required kinds, plus whichever of the 2
 * optional kinds were given) as byte buffers, then loads the character
 * through the WASM bridge from the 4 required buffers only — the bridge has
 * no parse call for the optional ones. `slots` must already be complete
 * (all 4 required kinds present) — callers check `isComplete` first.
 */
export async function loadCharacterFromSlots(
  slots: CompleteFileSlots,
  options: CharacterFileInputOptions = {},
): Promise<CharacterInputResult> {
  const readFileBytes = options.readFileBytes ?? readFileAsBytes;
  const files = {} as LoadedFileBytes;

  for (const kind of ALL_FILE_KINDS) {
    const file = slots[kind];
    if (!file) continue;
    const attempt = await readSlotBytes(kind, file, readFileBytes);
    if (!attempt.ok) {
      return { status: "read-error", error: attempt.error };
    }
    files[kind] = attempt.bytes;
  }

  const result = await loadCharacter(
    files.def,
    files.air,
    files.sff,
    files.cns,
    options,
  );

  if (!result.ok) {
    return { status: "bridge-error", message: result.error };
  }
  return { status: "success", character: result.character, files };
}
