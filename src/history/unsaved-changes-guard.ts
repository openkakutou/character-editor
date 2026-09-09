// The unsaved-changes navigation guard (backlog item 010): a native
// `beforeunload` confirmation, shown exactly when `isDirty()` is true.
// DOM-free logic (`handleBeforeUnload`) is kept separate from the real
// `window.addEventListener` wiring (`installUnsavedChangesGuard`) for the
// same testability reason every other browser-effect boundary in this app
// takes (`wasm/bridge.ts`'s fetch injection, `palette-editor.ts`'s download
// trigger).
import { isDirty } from "./app-history.ts";

/**
 * The shape this needs from a real `BeforeUnloadEvent` -- just enough to
 * trigger the browser's own confirmation prompt. Chrome/Firefox/Safari all
 * require both `preventDefault()` and a non-undefined `returnValue`;
 * neither alone is reliable across browsers.
 */
export interface UnloadEventLike {
  preventDefault(): void;
  returnValue: string;
}

/**
 * Shows the browser's native unsaved-changes confirmation when `dirty()` is
 * true, does nothing otherwise. `dirty` defaults to the shared history's own
 * `isDirty` but is injectable for testing. An error thrown by `dirty()`
 * propagates rather than being swallowed -- a broken dirty check silently
 * never warning the user about real unsaved work would be worse than a
 * visible failure.
 */
export function handleBeforeUnload(
  event: UnloadEventLike,
  dirty: () => boolean = isDirty,
): void {
  if (!dirty()) return;
  event.preventDefault();
  event.returnValue = "";
}

/** The minimal `addEventListener` shape this needs from `window`. */
export interface UnloadEventTarget {
  addEventListener(
    type: "beforeunload",
    listener: (event: UnloadEventLike) => void,
  ): void;
}

/**
 * Registers the real `beforeunload` listener. Called once at app bootstrap
 * (not on every `renderApp` call, which would otherwise stack up a fresh
 * listener on `window` on every re-render). `target`/`dirty` are injectable
 * for testing; default to the real `window`/`isDirty`.
 */
export function installUnsavedChangesGuard(
  target: UnloadEventTarget = window,
  dirty: () => boolean = isDirty,
): void {
  target.addEventListener("beforeunload", (event) => {
    handleBeforeUnload(event, dirty);
  });
}
