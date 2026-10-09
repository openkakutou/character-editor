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
  Partial<Record<OptionalFileKind, Uint8Array>> & {
    /** Raw `.snd` bytes, when the `.def` references one that was found and read. */
    snd?: Uint8Array;
    /**
     * Why the character's sounds are unavailable although the `.def`
     * references a `.snd` (missing, ambiguous, unreadable or invalid file).
     * Never blocks loading the rest of the character.
     */
    sndIssue?: string;
  };

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
      /** Files the browser could not read: the character opens without them (UX flow 002). */
      unreadable?: UnreadableFile[];
    }
  | { status: "read-error"; error: FileReadError }
  | { status: "bridge-error"; message: string };

/** A file that could not be read at load time but does not stop the character from opening. */
export interface UnreadableFile {
  kind: FileKind | "snd";
  fileName: string;
  /** Raw technical text from the browser, for the "Show details" disclosure. */
  detail: string;
}

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
  | { status: "cancelled" }
  | {
      status: "unsupported-version";
      fileName: string;
      version: string;
      supported: string;
    }
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

/** The named steps of a load, in order; `files` also reports `done` of `total`. */
export interface LoadProgress {
  step: "definition" | "files" | "engine" | "open";
  done?: number;
  total?: number;
}

export interface CharacterFileInputOptions extends WasmBridgeOptions {
  /** Reads a File's bytes. Defaults to `readFileAsBytes`; injectable for testing. */
  readFileBytes?: (file: File) => Promise<Uint8Array>;
  /** Aborts the load: a read that finishes late is ignored and the result is `cancelled`. */
  signal?: AbortSignal;
  /** Called as each named step starts, so a view can show where the load is. */
  onProgress?: (progress: LoadProgress) => void;
  /** Fetches the placeholder `.sff` that stands in for an unreadable one. Defaults to the bundled blank sheet. */
  fetchBlankSffBytes?: () => Promise<Uint8Array>;
}

const SUPPORTED_SFF_VERSIONS = "1 – 2";
const SFF_SIGNATURE = "ElecbyteSpr\0";

/**
 * The version of a `.sff` whose header names a major version the editor
 * cannot open, or `undefined` when the file is supported or is not a `.sff`
 * header at all (the engine then reports its own parse error). The library
 * treats anything that is not v2 as v1, so this is checked up front.
 */
export function unsupportedSffVersion(bytes: Uint8Array): string | undefined {
  if (bytes.length < 16) return undefined;
  const signature = String.fromCharCode(...bytes.subarray(0, 12));
  if (signature !== SFF_SIGNATURE) return undefined;
  const major = bytes[15];
  if (major === 1 || major === 2) return undefined;
  return `${major}.${bytes[14]}.${bytes[13]}.${bytes[12]}`;
}

async function defaultFetchBlankSffBytes(): Promise<Uint8Array> {
  const response = await fetch("./wizard/blank-character.sff");
  if (!response.ok) {
    throw new Error(
      `failed to fetch the blank sprite sheet: ${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
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

/**
 * Resolves, reads and returns the `.def`'s optional `sound` file. Every
 * failure is reported as `issue` text instead of an error status: a missing
 * or unreadable `.snd` never blocks the rest of the character.
 */
async function readOptionalSound(
  referencedPath: string,
  files: readonly GatheredFile[],
  readFileBytes: (file: File) => Promise<Uint8Array>,
): Promise<{
  bytes?: Uint8Array;
  fileName: string;
  issue?: string;
  /** Set when the file was found but the browser could not read it. */
  unreadableDetail?: string;
}> {
  const resolution = resolveReferencedFile(referencedPath, files);
  if (resolution.status === "no-reference") return { fileName: "" };
  const fileName = referencedBasename(referencedPath);
  if (resolution.status === "not-found") {
    return { fileName, issue: `${fileName}: file not found in the folder` };
  }
  if (resolution.status === "ambiguous") {
    return {
      fileName,
      issue: `${fileName}: ${resolution.candidates.length} files share this name in the folder`,
    };
  }
  try {
    return { bytes: await readFileBytes(resolution.entry.file), fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fileName,
      issue: `${fileName}: ${message}`,
      unreadableDetail: message,
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
  const cancelled = (): boolean => options.signal?.aborted === true;
  const cancelledResult = { status: "cancelled" } as const;
  options.onProgress?.({ step: "definition" });

  const defAttempt = await readKindBytes("def", entry.file, readFileBytes);
  if (cancelled()) return cancelledResult;
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
  const unreadable: UnreadableFile[] = [];
  for (const [index, { kind, entry: fileEntry }] of toRead.entries()) {
    options.onProgress?.({ step: "files", done: index, total: toRead.length });
    const attempt = await readKindBytes(kind, fileEntry.file, readFileBytes);
    if (cancelled()) return cancelledResult;
    if (attempt.ok) {
      bytesByKind[kind] = attempt.bytes;
      continue;
    }
    // The character opens without a sprite sheet, command or script file it
    // could not read; air and cns carry the logic and have no safe stand-in.
    if (kind === "air" || kind === "cns") {
      return { status: "read-error", error: attempt.error };
    }
    unreadable.push({
      kind,
      fileName: attempt.error.fileName,
      detail: attempt.error.message,
    });
  }
  options.onProgress?.({
    step: "files",
    done: toRead.length,
    total: toRead.length,
  });

  const sffBytes = bytesByKind.sff as Uint8Array | undefined;
  if (sffBytes !== undefined) {
    const version = unsupportedSffVersion(sffBytes);
    if (version !== undefined) {
      return {
        status: "unsupported-version",
        fileName: sffResolved.entry.file.name,
        version,
        supported: SUPPORTED_SFF_VERSIONS,
      };
    }
  } else {
    // The engine needs a sprite sheet to parse the rest: a blank one stands
    // in until the user replaces the unreadable file.
    try {
      bytesByKind.sff = await (
        options.fetchBlankSffBytes ?? defaultFetchBlankSffBytes
      )();
    } catch {
      const failure = unreadable.find((file) => file.kind === "sff");
      return {
        status: "read-error",
        error: {
          kind: "sff",
          fileName: failure?.fileName ?? sffResolved.entry.file.name,
          message: failure?.detail ?? "",
        },
      };
    }
    if (cancelled()) return cancelledResult;
  }

  const sound = await readOptionalSound(
    references.soundFile,
    files,
    readFileBytes,
  );
  if (cancelled()) return cancelledResult;
  if (sound.bytes) bytesByKind.snd = sound.bytes;
  if (sound.issue) bytesByKind.sndIssue = sound.issue;
  if (sound.unreadableDetail !== undefined) {
    unreadable.push({
      kind: "snd",
      fileName: sound.fileName,
      detail: sound.unreadableDetail,
    });
  }

  options.onProgress?.({ step: "engine" });
  const loadWith = (sndBytes?: Uint8Array) =>
    loadCharacter(
      bytesByKind.def,
      bytesByKind.air,
      bytesByKind.sff,
      bytesByKind.cns,
      { ...options, sndBytes },
    );

  let result = await loadWith(sound.bytes);
  if (cancelled()) return cancelledResult;
  if (!result.ok && sound.bytes) {
    // A wholly invalid .snd must not stop the rest of the character from
    // loading: retry without it and surface why the sounds are missing.
    const withoutSounds = await loadWith(undefined);
    if (cancelled()) return cancelledResult;
    if (withoutSounds.ok) {
      bytesByKind.snd = undefined;
      bytesByKind.sndIssue = `${sound.fileName}: ${result.error}`;
      result = withoutSounds;
    }
  }
  if (!result.ok) return { status: "bridge-error", message: result.error };

  options.onProgress?.({ step: "open" });
  return {
    status: "success",
    character: result.character,
    files: bytesByKind,
    ...(zssResolution.status === "ambiguous"
      ? { zssAmbiguousCount: zssResolution.candidates.length }
      : {}),
    ...(unreadable.length > 0 ? { unreadable } : {}),
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
