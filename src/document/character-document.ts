// The in-memory representation of the currently loaded character: the
// WASM-parsed `CharacterData` plus the raw bytes of every file the user
// supplied (required and optional alike). This is what backlog item 002's
// last acceptance criterion ("held in memory ... the later editors can read
// from and write back to") actually means in code — a single, importable
// place later editor items (003-008) read from, and will eventually mutate
// and write back through, rather than each re-deriving its own copy of the
// loaded character. See
// .vibe/decisions/002-required-vs-optional-input-files-and-in-memory-document.md.
//
// Deliberately a plain module-level variable, not a class or an injected
// dependency: this is in-process application state (no external effect to
// substitute in tests), so a get/set pair with a test-only reset is the
// simplest thing that works — the same "reset between tests" shape
// src/wasm/bridge.ts's resetWasmBridgeForTests already established for its
// own module-level memoization.
import { emptyCommandFile } from "../commands/command-logic.ts";
import {
  getAppHistory,
  markClean,
  pushHistoryCommand,
  resetAppHistoryForTests,
} from "../history/app-history.ts";
import type { LoadedFileBytes } from "../input/character-file-input.ts";
import { type SpriteEdit, applySpriteEdit } from "../sprites/sprite-edits.ts";
import type { CharacterData, CommandFile } from "../wasm/types.ts";

export interface CharacterDocument {
  character: CharacterData;
  files: LoadedFileBytes;
  /** Pending sprite import/replace/delete edits (item 004) — see sprite-edits.ts. */
  spriteEdits: SpriteEdit[];
  /**
   * The command editor's (item 008) latest committed `.cmd` model — a
   * write-only sink from that editor's perspective (it keeps its own local
   * copy for rendering, the same "session-only editing state reported
   * upward" shape `spriteEdits`/`sprite-browser.ts` already established),
   * populated for a future save/export item. Always starts at
   * `emptyCommandFile()` on a fresh load, discarding any prior document's.
   */
  commandFile: CommandFile;
}

/** Everything a caller supplies to setCharacterDocument — spriteEdits always starts empty on load. */
export type LoadedCharacter = Pick<CharacterDocument, "character" | "files">;

let current: CharacterDocument | null = null;

/**
 * A deep clone of `current.character` as it stood right after the last
 * commit (initial load or a prior `updateCharacterFields` call) — maintained
 * eagerly rather than derived from `current` on demand, because by the time
 * `updateCharacterFields` runs, an editor may already have mutated
 * `current.character`'s nested objects in place (see that function's own
 * doc comment). Never exposed outside this module, so nothing ever mutates
 * it in place the way editors mutate `current.character`.
 */
let lastCharacterSnapshot: CharacterData | null = null;

/** The currently loaded character, or `null` before any file input succeeds. */
export function getCharacterDocument(): CharacterDocument | null {
  return current;
}

/**
 * Replaces the currently loaded character. Pass `null` to clear it. Always
 * starts with an empty `spriteEdits` overlay — a freshly loaded document
 * has no pending edits of its own yet, discarding any the previous one had.
 * Also clears the shared undo/redo history (item 010) and marks the
 * document clean — a fresh load starts a new editing session, with nothing
 * of a previous document's history left to undo into.
 */
export function setCharacterDocument(doc: LoadedCharacter | null): void {
  current =
    doc === null
      ? null
      : { ...doc, spriteEdits: [], commandFile: emptyCommandFile() };
  lastCharacterSnapshot = current ? structuredClone(current.character) : null;
  getAppHistory().clear();
  markClean();
}

/** Resets the in-memory document, and the shared undo/redo history, to their initial states. Test-only. */
export function resetCharacterDocumentForTests(): void {
  current = null;
  lastCharacterSnapshot = null;
  resetAppHistoryForTests();
}

/**
 * Installs `character` (a `before`/`after` value captured by a prior
 * `updateCharacterFields` call) as the live `current.character` — always via
 * a fresh clone, never the value itself, so that value stays reusable and
 * untouched across however many times undo/redo toggles back to it. Also
 * becomes the new `lastCharacterSnapshot` directly (no extra clone needed):
 * nothing outside this module ever sees `character` itself to mutate it,
 * only the fresh clone installed into `current.character`.
 */
function applyCharacterSnapshot(character: CharacterData): void {
  if (current === null) return;
  current = { ...current, character: structuredClone(character) };
  lastCharacterSnapshot = character;
}

/**
 * Merges `patch` onto the currently loaded character, leaving every other
 * field (and the raw file bytes) untouched. The single mutation path editor
 * screens (starting with the characteristics editor, item 003) use to
 * reflect a user's edit immediately — see that screen's `onChange` wiring in
 * `main.ts`. A no-op, not an error, when no character is loaded: an editor
 * screen only ever renders once one is, so this guards against a stray
 * event firing during/after teardown rather than a real caller bug.
 *
 * Records an undo/redo entry (item 010) on the shared history, coalesced by
 * the patched field name(s) so rapid same-field edits (e.g. typing into a
 * text field) merge into a single undo step. The before/after character
 * values are captured as deep clones, not live references — several
 * editors (state-editor.ts, animation-editor.ts) mutate a nested object
 * (e.g. a StateDef's controllers) in place before calling `onChange` with
 * the same array reference, so a reference-based snapshot would already
 * equal the post-edit value by the time this runs. See
 * .vibe/decisions/011-undo-redo-snapshot-strategy.md.
 */
export function updateCharacterFields(patch: Partial<CharacterData>): void {
  if (current === null) return;
  const before = lastCharacterSnapshot ?? structuredClone(current.character);
  const after = structuredClone({ ...current.character, ...patch });
  const coalesceKey = `character-fields:${Object.keys(patch).sort().join(",")}`;

  pushHistoryCommand({
    coalesceKey,
    do: () => applyCharacterSnapshot(after),
    undo: () => applyCharacterSnapshot(before),
  });
}

function applySpriteEditsSnapshot(spriteEdits: SpriteEdit[]): void {
  if (current === null) return;
  current = { ...current, spriteEdits };
}

/**
 * Appends `edit` to the currently loaded document's pending sprite edits
 * (see applySpriteEdit — an edit for a sprite already pending one replaces
 * it rather than piling up). A no-op, not an error, when no character is
 * loaded, mirroring updateCharacterFields's own guard. Records an undo/redo
 * entry (item 010): `applySpriteEdit` always returns a fresh array without
 * mutating an existing pending edit in place, so the before/after arrays
 * are safe to keep by reference, unlike `updateCharacterFields`'s `character`.
 */
export function addSpriteEdit(edit: SpriteEdit): void {
  if (current === null) return;
  const before = current.spriteEdits;
  const after = applySpriteEdit(current.spriteEdits, edit);

  pushHistoryCommand({
    do: () => applySpriteEditsSnapshot(after),
    undo: () => applySpriteEditsSnapshot(before),
  });
}

function applyCommandFileSnapshot(commandFile: CommandFile): void {
  if (current === null) return;
  current = { ...current, commandFile };
}

/**
 * Replaces the currently loaded document's `commandFile` wholesale — the
 * command editor's (item 008) own `onChange` wiring, mirroring
 * `updateCharacterFields`'s guard: a no-op, not an error, when no character
 * is loaded. Records a coalesced undo/redo entry (item 010) the same way
 * `updateCharacterFields` does — `command-editor.ts`'s `commitAll` always
 * rebuilds `commandFile` immutably (a fresh object/array, never a mutated
 * one), so a reference-based before/after snapshot is safe here too.
 */
export function setCommandFile(commandFile: CommandFile): void {
  if (current === null) return;
  const before = current.commandFile;

  pushHistoryCommand({
    coalesceKey: "command-file",
    do: () => applyCommandFileSnapshot(commandFile),
    undo: () => applyCommandFileSnapshot(before),
  });
}

/**
 * Replaces the currently loaded document's `commandFile` WITHOUT recording
 * an undo/redo entry -- `command-editor.ts`'s own one-time "seed the store
 * with the freshly parsed `.cmd` file" call at mount (its `startReady`) is a
 * load-time normalization, not a user edit, and must not itself become an
 * undoable/redoable/dirtying history entry the way a genuine edit
 * (`setCommandFile`) does. A no-op when no character is loaded, mirroring
 * every other mutator's guard.
 */
export function seedCommandFile(commandFile: CommandFile): void {
  applyCommandFileSnapshot(commandFile);
}
