// The app-wide shared undo/redo history (backlog item 010), built directly
// on `@openkakutou/web-ui-kit`'s `CommandStack` primitive rather than a
// bespoke history implementation -- see that item's own notes and
// `.vibe/decisions/011-undo-redo-snapshot-strategy.md`. A single module-level
// instance, the same "in-process application state, reset between tests"
// shape `character-document.ts`/`wasm/bridge.ts` already established for
// their own module-level state, so every editor screen shares exactly one
// history regardless of which one it edited through.
//
// "Dirty" is derived from the stack's saved mark (`markSaved` /
// `isAtSavedState`, web-ui-kit 0.16): undoing back to the last export or
// open clears it. This supersedes
// `.vibe/decisions/012-unsaved-changes-dirty-flag-not-undo-stack-derived.md`,
// which predates the saved mark.
import { CommandStack } from "@openkakutou/web-ui-kit";
import type { Command } from "@openkakutou/web-ui-kit";
import type { SectionId } from "../shell/sections.ts";

/** What a history entry touched: the section Undo navigates to and the label it announces. */
export interface HistoryMeta {
  section: SectionId;
  label: string;
}

let history = new CommandStack<HistoryMeta>();

/** The single shared undo/redo history every editor screen pushes onto and reads from. */
export function getAppHistory(): CommandStack<HistoryMeta> {
  return history;
}

/**
 * Pushes `command` onto the shared history (applying its `do()` immediately,
 * per `CommandStack`'s own contract) and marks the document dirty. The one
 * path every history-worthy edit -- in any editor -- goes through, so
 * "dirty" can never be forgotten at a call site.
 */
export function pushHistoryCommand(command: Command<HistoryMeta>): void {
  history.push(command);
}

/** True while the history differs from the position recorded by the last `markClean()`. */
export function isDirty(): boolean {
  return !history.isAtSavedState;
}

/**
 * Marks the document clean -- called on a fresh character load and after a
 * complete export. Does not clear history: undo still works across a save,
 * and undoing past this point makes the document dirty again.
 */
export function markClean(): void {
  history.markSaved();
}

/** Resets the shared history (and so the saved mark). Test-only. */
export function resetAppHistoryForTests(): void {
  history = new CommandStack<HistoryMeta>();
}
