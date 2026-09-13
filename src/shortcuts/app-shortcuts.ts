// The app-wide shared keyboard-shortcut manager (backlog item 011), built
// directly on `@openkakutou/web-ui-kit`'s headless `ShortcutManager` rather
// than a bespoke hardcoded key handler -- see
// `.vibe/decisions/014-shortcut-manager-scope-and-wiring.md` for which
// actions are in scope and why. A single module-level instance, the same
// "in-process application state, reset between tests" shape
// `history/app-history.ts`/`document/character-document.ts` already
// established for their own module-level state, so every screen shares
// exactly one set of bindings.
//
// A dedicated `storageKey` (rather than the manager's own default) is
// required per `ShortcutManagerOptions`' own doc comment: sharing the
// default key across every OpenKakutou app on the same origin would also
// share their persisted overrides.
import { ShortcutManager } from "@openkakutou/web-ui-kit";
import type { ShortcutAction } from "@openkakutou/web-ui-kit";

const STORAGE_KEY = "character-editor-shortcuts";

/**
 * Every action this app registers with the shared shortcut manager. Each
 * `id` intentionally equals the `data-action` attribute already present on
 * the one existing button that performs it (see
 * `shortcuts/global-shortcut-listener.ts`), so triggering a shortcut can
 * never run different logic than clicking that button. `Alt+Shift+*` (not
 * `Ctrl+Alt+*`) is used for the three "add" actions specifically to avoid
 * colliding with AltGr, which many European keyboard layouts synthesize as
 * `ctrlKey + altKey` both true.
 */
export const APP_SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  { id: "undo", label: "Undo", defaultKey: "Ctrl+Z" },
  { id: "redo", label: "Redo", defaultKey: "Ctrl+Y" },
  {
    id: "download-all",
    label: "Save / export (download all)",
    defaultKey: "Ctrl+S",
  },
  { id: "add-animation", label: "Add animation", defaultKey: "Alt+Shift+A" },
  { id: "add-statedef", label: "Add StateDef", defaultKey: "Alt+Shift+S" },
  { id: "add-command", label: "Add command", defaultKey: "Alt+Shift+C" },
];

/** Registers every `APP_SHORTCUT_ACTIONS` entry on `manager`. Idempotent -- `ShortcutManager.register` overwrites by id, so calling this more than once on the same manager never duplicates a row. */
export function registerAppShortcutActions(manager: ShortcutManager): void {
  for (const action of APP_SHORTCUT_ACTIONS) {
    manager.register(action);
  }
}

let manager: ShortcutManager | undefined;

/** The single shared shortcut manager every screen's action registers on and the global listener reads bindings from. Created and registered lazily on first call. */
export function getAppShortcuts(): ShortcutManager {
  if (manager === undefined) {
    manager = new ShortcutManager({ storageKey: STORAGE_KEY });
    registerAppShortcutActions(manager);
  }
  return manager;
}

/**
 * Resets the shared manager to a fresh instance with defaults restored --
 * also clears its persisted overrides, since `ShortcutManager` reads them
 * from `localStorage` at registration time and a stale override would
 * otherwise survive the reset and leak into the next test. Test-only.
 */
export function resetAppShortcutsForTests(): void {
  manager = undefined;
  if (typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  }
}
