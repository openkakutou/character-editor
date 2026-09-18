// Gathers files from a folder selection, from either of the two browser
// entry points this app supports: the `<input webkitdirectory>` picker
// (a plain FileList, each File already carrying `webkitRelativePath`) or a
// drag-and-drop of a folder (`DataTransferItem.webkitGetAsEntry()` plus a
// recursive `FileSystemDirectoryReader` walk — see backlog item 014's own
// Notes for why folder selection is the only way to reach sibling files on
// the web). Neither `FileSystemEntry` nor `DataTransferItem` is fully
// modeled here — only the handful of members actually used — so the walk
// logic can be unit-tested against plain mock objects instead of depending
// on jsdom implementing these non-standard, Chromium-originated APIs (it
// does not). Ported near-verbatim from `stage-editor`'s own
// `src/input/folder-entries.ts` (itself ported from `lifebar-viewer-web`) —
// generic gathering logic, no domain specifics. See
// .vibe/decisions/016-folder-only-input-def-files-parse-and-ported-resolution.md.

/** A gathered file plus its path relative to the folder the user picked. */
export interface GatheredFile {
  file: File;
  relativePath: string;
}

export interface FileEntryLike {
  isFile: true;
  isDirectory: false;
  fullPath: string;
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: unknown) => void,
  ): void;
}

export interface DirectoryReaderLike {
  /**
   * Per spec, a single call is not guaranteed to return every child — it
   * must be called repeatedly until it resolves with an empty array.
   */
  readEntries(
    successCallback: (entries: EntryLike[]) => void,
    errorCallback?: (error: unknown) => void,
  ): void;
}

export interface DirectoryEntryLike {
  isFile: false;
  isDirectory: true;
  fullPath: string;
  createReader(): DirectoryReaderLike;
}

export type EntryLike = FileEntryLike | DirectoryEntryLike;

/** The subset of `DataTransferItem` this module actually reads. */
export interface DataTransferItemLike {
  webkitGetAsEntry(): EntryLike | null;
}

/** Strips a single leading slash, since `FileSystemEntry.fullPath` always starts with one. */
function toRelativePath(fullPath: string): string {
  return fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
}

function readAllEntries(reader: DirectoryReaderLike): Promise<EntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: EntryLike[] = [];
    const readNextBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readNextBatch();
      }, reject);
    };
    readNextBatch();
  });
}

function readEntryFile(entry: FileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/** Recursively collects every file under `entry`, flattened, relative paths preserved. */
export async function collectFilesFromEntry(
  entry: EntryLike,
): Promise<GatheredFile[]> {
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    return [{ file, relativePath: toRelativePath(entry.fullPath) }];
  }

  const children = await readAllEntries(entry.createReader());
  const collected = await Promise.all(
    children.map((child) => collectFilesFromEntry(child)),
  );
  return collected.flat();
}

/**
 * Gathers every file dropped, walking any dropped directories recursively.
 * An item yielding no entry (e.g. a non-file drag source) is skipped.
 */
export async function filesFromDataTransferItems(
  items: readonly DataTransferItemLike[],
): Promise<GatheredFile[]> {
  const entries = items
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is EntryLike => entry !== null);
  const collected = await Promise.all(
    entries.map((entry) => collectFilesFromEntry(entry)),
  );
  return collected.flat();
}

/**
 * Adapts the flat `FileList` a `<input webkitdirectory>` picker produces
 * into the same `GatheredFile[]` shape the drag-and-drop path returns.
 */
export function filesFromWebkitDirectoryFiles(
  files: readonly File[],
): GatheredFile[] {
  return files.map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}
