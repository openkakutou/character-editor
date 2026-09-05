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

/** The currently loaded character, or `null` before any file input succeeds. */
export function getCharacterDocument(): CharacterDocument | null {
  return current;
}

/**
 * Replaces the currently loaded character. Pass `null` to clear it. Always
 * starts with an empty `spriteEdits` overlay — a freshly loaded document
 * has no pending edits of its own yet, discarding any the previous one had.
 */
export function setCharacterDocument(doc: LoadedCharacter | null): void {
  current =
    doc === null
      ? null
      : { ...doc, spriteEdits: [], commandFile: emptyCommandFile() };
}

/** Resets the in-memory document to its initial (unloaded) state. Test-only. */
export function resetCharacterDocumentForTests(): void {
  current = null;
}

/**
 * Merges `patch` onto the currently loaded character in place, leaving
 * every other field (and the raw file bytes) untouched. The single mutation
 * path editor screens (starting with the characteristics editor, item 003)
 * use to reflect a user's edit immediately — see that screen's `onChange`
 * wiring in `main.ts`. A no-op, not an error, when no character is loaded:
 * an editor screen only ever renders once one is, so this guards against a
 * stray event firing during/after teardown rather than a real caller bug.
 */
export function updateCharacterFields(patch: Partial<CharacterData>): void {
  if (current === null) return;
  current = { ...current, character: { ...current.character, ...patch } };
}

/**
 * Appends `edit` to the currently loaded document's pending sprite edits
 * (see applySpriteEdit — an edit for a sprite already pending one replaces
 * it rather than piling up). A no-op, not an error, when no character is
 * loaded, mirroring updateCharacterFields's own guard.
 */
export function addSpriteEdit(edit: SpriteEdit): void {
  if (current === null) return;
  current = {
    ...current,
    spriteEdits: applySpriteEdit(current.spriteEdits, edit),
  };
}

/**
 * Replaces the currently loaded document's `commandFile` wholesale — the
 * command editor's (item 008) own `onChange` wiring, mirroring
 * `updateCharacterFields`'s guard: a no-op, not an error, when no character
 * is loaded.
 */
export function setCommandFile(commandFile: CommandFile): void {
  if (current === null) return;
  current = { ...current, commandFile };
}
