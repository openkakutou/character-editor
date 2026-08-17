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
import type { LoadedFileBytes } from "../input/character-file-input.ts";
import type { CharacterData } from "../wasm/types.ts";

export interface CharacterDocument {
  character: CharacterData;
  files: LoadedFileBytes;
}

let current: CharacterDocument | null = null;

/** The currently loaded character, or `null` before any file input succeeds. */
export function getCharacterDocument(): CharacterDocument | null {
  return current;
}

/** Replaces the currently loaded character. Pass `null` to clear it. */
export function setCharacterDocument(doc: CharacterDocument | null): void {
  current = doc;
}

/** Resets the in-memory document to its initial (unloaded) state. Test-only. */
export function resetCharacterDocumentForTests(): void {
  current = null;
}
