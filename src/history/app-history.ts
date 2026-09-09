// The app-wide shared undo/redo history (backlog item 010), built directly
// on `@openkakutou/web-ui-kit`'s `CommandStack` primitive rather than a
// bespoke history implementation -- see that item's own notes and
// `.vibe/decisions/011-undo-redo-snapshot-strategy.md`. A single module-level
// instance, the same "in-process application state, reset between tests"
// shape `character-document.ts`/`wasm/bridge.ts` already established for
// their own module-level state, so every editor screen shares exactly one
// history regardless of which one it edited through.
//
// Also owns the "dirty" flag the unsaved-changes guard (item 010) reads --
// kept separate from `CommandStack.canUndo` rather than derived from it, see
// `.vibe/decisions/012-unsaved-changes-dirty-flag-not-undo-stack-derived.md`.
import { CommandStack } from "@openkakutou/web-ui-kit";
import type { Command } from "@openkakutou/web-ui-kit";

let history = new CommandStack();
let dirty = false;

/** The single shared undo/redo history every editor screen pushes onto and reads from. */
export function getAppHistory(): CommandStack {
  return history;
}

/**
 * Pushes `command` onto the shared history (applying its `do()` immediately,
 * per `CommandStack`'s own contract) and marks the document dirty. The one
 * path every history-worthy edit -- in any editor -- goes through, so
 * "dirty" can never be forgotten at a call site.
 */
export function pushHistoryCommand(command: Command): void {
  history.push(command);
  dirty = true;
}

/** True once any edit has been pushed since the last `markClean()` call. */
export function isDirty(): boolean {
  return dirty;
}

/**
 * Marks the document clean -- called on a fresh character load and after a
 * complete Export "Download all". Does not clear history: undo still works
 * across a save, it just no longer counts as "unsaved" on its own.
 */
export function markClean(): void {
  dirty = false;
}

/** Resets both the shared history and the dirty flag. Test-only. */
export function resetAppHistoryForTests(): void {
  history = new CommandStack();
  dirty = false;
}
