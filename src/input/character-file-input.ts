// Pure, DOM-free logic for a folder-based character load (backlog item
// 014): given the files gathered from a folder selection/drop (see
// ./folder-entries.ts), finds the character's `.def` entry point, learns
// which sibling files it actually references (via
// ./def-files-section.ts's minimal `[Files]`-section read), resolves each
// referenced filename against the folder listing by basename, then feeds
// the resolved bytes to the `character` WASM bridge. Replaces item 002's
// per-kind file accumulation outright on this app's web build — see
// .vibe/decisions/016-folder-only-input-def-files-parse-and-ported-resolution.md
// for why a local `.def` parse is unavoidable here (unlike `stage`/
// `lifebar`'s own WASM bridges, `character`'s `load` call needs all four
// required files' bytes at once, so there is no WASM call that could
// answer "what does this .def reference" on its own) and why the
// candidate-detection/referenced-file-resolution rules are ported from
// `stage-editor`/`lifebar-editor`'s own already-shipped folder input.
import { loadCharacter } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { parseDefFileReferences } from "./def-files-section.ts";
import type { GatheredFile } from "./folder-entries.ts";

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

/** Stable display order for the 4 required kinds. */
export const REQUIRED_FILE_KINDS: readonly RequiredFileKind[] = [
  "def",
  "air",
  "sff",
  "cns",
];

/** Stable display order for the 2 optional kinds. */
export const OPTIONAL_FILE_KINDS: readonly OptionalFileKind[] = ["cmd", "zss"];

/** Every accepted kind, required first. */
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

/** The 3 always-required, `.def`-referenced kinds, plus the one optional kind the `.def` may also reference. */
type ReferencedKind = "air" | "sff" | "cns" | "cmd";

function isDefFile(gathered: GatheredFile): boolean {
  return gathered.file.name.toLowerCase().endsWith(".def");
}

export type DefCandidateResolution =
  | { status: "no-files" }
  | { status: "no-candidate" }
  | { status: "success"; entry: GatheredFile }
  | { status: "needs-selection"; candidates: GatheredFile[] };

/**
 * Decides what to do with the files gathered from a folder selection: none
 * gathered at all, none ending in `.def`, exactly one match (auto-load), or
 * several (the caller must ask the user which one is the character).
 */
export function resolveDefCandidates(
  files: readonly GatheredFile[],
): DefCandidateResolution {
  if (files.length === 0) {
    return { status: "no-files" };
  }
  const candidates = files.filter(isDefFile);
  if (candidates.length === 0) {
    return { status: "no-candidate" };
  }
  if (candidates.length === 1) {
    return { status: "success", entry: candidates[0] };
  }
  return { status: "needs-selection", candidates };
}

/** The last path segment of a `.def`-referenced path, forward- or backslash-separated. */
function referencedBasename(referencedPath: string): string {
  const normalized = referencedPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1];
}

export type ReferenceResolution =
  | { status: "no-reference" }
  | { status: "success"; entry: GatheredFile }
  | { status: "not-found"; referencedName: string }
  | { status: "ambiguous"; referencedName: string; candidates: GatheredFile[] };

/**
 * Resolves a `.def`-referenced filename against the already-gathered folder
 * listing, by basename — exact match first, case-insensitive fallback
 * second (mirroring `stage-editor`/`lifebar-editor`'s own established
 * resolution rule). More than one match at either level is reported as
 * ambiguous rather than silently picking one.
 */
export function resolveReferencedFile(
  referencedPath: string,
  files: readonly GatheredFile[],
): ReferenceResolution {
  if (referencedPath.trim() === "") {
    return { status: "no-reference" };
  }

  const targetBasename = referencedBasename(referencedPath);

  const exact = files.filter((f) => f.file.name === targetBasename);
  if (exact.length === 1) return { status: "success", entry: exact[0] };
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      referencedName: referencedPath,
      candidates: exact,
    };
  }

  const targetLower = targetBasename.toLowerCase();
  const caseInsensitive = files.filter(
    (f) => f.file.name.toLowerCase() === targetLower,
  );
  if (caseInsensitive.length === 1) {
    return { status: "success", entry: caseInsensitive[0] };
  }
  if (caseInsensitive.length > 1) {
    return {
      status: "ambiguous",
      referencedName: referencedPath,
      candidates: caseInsensitive,
    };
  }

  return { status: "not-found", referencedName: referencedPath };
}

export type ZssResolution =
  | { status: "none" }
  | { status: "success"; entry: GatheredFile }
  | { status: "ambiguous"; candidates: GatheredFile[] };

/**
 * Resolves the optional `.zss` file by extension alone — unlike
 * `.air`/`.sff`/`.cns`/`.cmd`, the `character` library's `.def` parser has
 * no `[Files]` key that ever references a `.zss` file's name (confirmed by
 * reading its source), so there is nothing to look a name up against. See
 * .vibe/decisions/016.
 */
export function resolveZssFile(files: readonly GatheredFile[]): ZssResolution {
  const candidates = files.filter((f) =>
    f.file.name.toLowerCase().endsWith(".zss"),
  );
  if (candidates.length === 0) return { status: "none" };
  if (candidates.length === 1)
    return { status: "success", entry: candidates[0] };
  return { status: "ambiguous", candidates };
}

/** A specific file's bytes could not be read (e.g. an unreadable/corrupt selection). */
export interface FileReadError {
  kind: FileKind;
  fileName: string;
  message: string;
}

/** Raw bytes read for every kind actually resolved — required kinds always present, optional kinds only when found. */
export type LoadedFileBytes = Record<RequiredFileKind, Uint8Array> &
  Partial<Record<OptionalFileKind, Uint8Array>>;

/**
 * Outcome of reading the resolved files and passing the 4 required ones to
 * the WASM bridge. `zssAmbiguousCount` is set only when more than one
 * `.zss` file was found in the folder — reported for visibility but never
 * blocking, since `.zss` is optional (see .vibe/decisions/016).
 */
export type CharacterInputResult =
  | {
      status: "success";
      character: CharacterData;
      files: LoadedFileBytes;
      zssAmbiguousCount?: number;
    }
  | { status: "read-error"; error: FileReadError }
  | { status: "bridge-error"; message: string };

/**
 * Every outcome a folder-based load can produce: `CharacterInputResult`'s
 * own 3 (once a single `.def` is settled and its references are all
 * resolved) plus the folder/candidate/reference-resolution stages that can
 * end the attempt earlier.
 */
export type CharacterFolderLoadResult =
  | CharacterInputResult
  | { status: "no-files" }
  | { status: "no-candidate" }
  | { status: "needs-selection"; candidates: GatheredFile[] }
  | {
      status: "reference-not-found";
      kind: ReferencedKind;
      referencedName: string;
    }
  | {
      status: "reference-ambiguous";
      kind: ReferencedKind;
      referencedName: string;
      candidates: GatheredFile[];
    };

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
  /** Reads a File's bytes. Defaults to `readFileAsBytes`; injectable for testing. */
  readFileBytes?: (file: File) => Promise<Uint8Array>;
}

async function readKindBytes(
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

type RequiredReferenceResult =
  | { ok: true; entry: GatheredFile }
  | {
      ok: false;
      result: Extract<
        CharacterFolderLoadResult,
        { status: "reference-not-found" | "reference-ambiguous" }
      >;
    };

/**
 * Resolves one always-required referenced kind (`air`/`sff`/`cns`), folding
 * an empty/absent reference into the same "not found" outcome as one that
 * was named but couldn't be located — either way there is nothing usable
 * to load.
 */
function resolveRequiredReference(
  kind: ReferencedKind,
  referencedPath: string,
  files: readonly GatheredFile[],
): RequiredReferenceResult {
  const resolution = resolveReferencedFile(referencedPath, files);
  if (resolution.status === "success") {
    return { ok: true, entry: resolution.entry };
  }
  if (resolution.status === "ambiguous") {
    return {
      ok: false,
      result: {
        status: "reference-ambiguous",
        kind,
        referencedName: resolution.referencedName,
        candidates: resolution.candidates,
      },
    };
  }
  const referencedName =
    resolution.status === "not-found" ? resolution.referencedName : "";
  return {
    ok: false,
    result: { status: "reference-not-found", kind, referencedName },
  };
}

/**
 * Reads and parses a single already-chosen `.def` candidate: learns which
 * sibling files it references, resolves each against `files` (the same
 * folder listing the candidate itself came from), reads their bytes, and
 * loads the character through the WASM bridge.
 */
export async function loadCharacterFromChosenDef(
  entry: GatheredFile,
  files: readonly GatheredFile[],
  options: CharacterFileInputOptions = {},
): Promise<CharacterFolderLoadResult> {
  const readFileBytes = options.readFileBytes ?? readFileAsBytes;

  const defAttempt = await readKindBytes("def", entry.file, readFileBytes);
  if (!defAttempt.ok) return { status: "read-error", error: defAttempt.error };
  const defBytes = defAttempt.bytes;

  const references = parseDefFileReferences(new TextDecoder().decode(defBytes));

  const airResolved = resolveRequiredReference(
    "air",
    references.animationFile,
    files,
  );
  if (!airResolved.ok) return airResolved.result;
  const sffResolved = resolveRequiredReference(
    "sff",
    references.spriteFile,
    files,
  );
  if (!sffResolved.ok) return sffResolved.result;
  const cnsResolved = resolveRequiredReference(
    "cns",
    references.constantsFile,
    files,
  );
  if (!cnsResolved.ok) return cnsResolved.result;

  // .cmd is optional: only an error if the .def actually names one that
  // can't be located; simply not referenced is not an error.
  let cmdEntry: GatheredFile | undefined;
  const cmdResolution = resolveReferencedFile(references.commandFile, files);
  if (cmdResolution.status === "success") {
    cmdEntry = cmdResolution.entry;
  } else if (cmdResolution.status === "not-found") {
    return {
      status: "reference-not-found",
      kind: "cmd",
      referencedName: cmdResolution.referencedName,
    };
  } else if (cmdResolution.status === "ambiguous") {
    return {
      status: "reference-ambiguous",
      kind: "cmd",
      referencedName: cmdResolution.referencedName,
      candidates: cmdResolution.candidates,
    };
  }

  // .zss is optional and never def-referenced (see resolveZssFile):
  // ambiguity here is surfaced, not blocking.
  const zssResolution = resolveZssFile(files);
  const zssEntry =
    zssResolution.status === "success" ? zssResolution.entry : undefined;

  const toRead: { kind: FileKind; entry: GatheredFile }[] = [
    { kind: "air", entry: airResolved.entry },
    { kind: "sff", entry: sffResolved.entry },
    { kind: "cns", entry: cnsResolved.entry },
  ];
  if (cmdEntry) toRead.push({ kind: "cmd", entry: cmdEntry });
  if (zssEntry) toRead.push({ kind: "zss", entry: zssEntry });

  const bytesByKind = { def: defBytes } as LoadedFileBytes;
  for (const { kind, entry: fileEntry } of toRead) {
    const attempt = await readKindBytes(kind, fileEntry.file, readFileBytes);
    if (!attempt.ok) return { status: "read-error", error: attempt.error };
    bytesByKind[kind] = attempt.bytes;
  }

  const result = await loadCharacter(
    bytesByKind.def,
    bytesByKind.air,
    bytesByKind.sff,
    bytesByKind.cns,
    options,
  );
  if (!result.ok) return { status: "bridge-error", message: result.error };

  return {
    status: "success",
    character: result.character,
    files: bytesByKind,
    ...(zssResolution.status === "ambiguous"
      ? { zssAmbiguousCount: zssResolution.candidates.length }
      : {}),
  };
}

/**
 * Resolves which candidate `.def` to use among the files gathered from a
 * folder selection, then — only once a single candidate is settled — reads,
 * parses, and resolves its referenced files. `no-files`/`no-candidate`/
 * `needs-selection` short-circuit without reading anything.
 */
export async function loadCharacterFromFolderFiles(
  files: readonly GatheredFile[],
  options: CharacterFileInputOptions = {},
): Promise<CharacterFolderLoadResult> {
  const resolution = resolveDefCandidates(files);
  if (resolution.status !== "success") {
    return resolution;
  }
  return loadCharacterFromChosenDef(resolution.entry, files, options);
}
