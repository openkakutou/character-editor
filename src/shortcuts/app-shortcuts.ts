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
import { onLocaleChange, t } from "../i18n/i18n.ts";

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
const SHORTCUT_DEFS: readonly {
  id: string;
  defaultKey: string;
  labelKey: string;
  label: string;
}[] = [
  {
    id: "undo",
    defaultKey: "Ctrl+Z",
    labelKey: "shortcuts.undo",
    label: "Undo",
  },
  {
    id: "redo",
    defaultKey: "Ctrl+Y",
    labelKey: "shortcuts.redo",
    label: "Redo",
  },
  {
    id: "download-all",
    defaultKey: "Ctrl+S",
    labelKey: "shortcuts.downloadAll",
    label: "Download all",
  },
  {
    id: "add-animation",
    defaultKey: "Alt+Shift+A",
    labelKey: "shortcuts.addAnimation",
    label: "Add animation",
  },
  {
    id: "add-statedef",
    defaultKey: "Alt+Shift+S",
    labelKey: "shortcuts.addState",
    label: "Add state",
  },
  {
    id: "add-command",
    defaultKey: "Alt+Shift+C",
    labelKey: "shortcuts.addCommand",
    label: "Add command",
  },
];

/** The actions with their labels resolved in the active language. */
export function appShortcutActions(): readonly ShortcutAction[] {
  return SHORTCUT_DEFS.map((def) => ({
    id: def.id,
    label: t(def.labelKey, def.label),
    defaultKey: def.defaultKey,
  }));
}

/** Registers every `APP_SHORTCUT_ACTIONS` entry on `manager`. Idempotent -- `ShortcutManager.register` overwrites by id, so calling this more than once on the same manager never duplicates a row. */
export function registerAppShortcutActions(manager: ShortcutManager): void {
  for (const action of appShortcutActions()) {
    manager.register(action);
  }
}

let manager: ShortcutManager | undefined;

/** The single shared shortcut manager every screen's action registers on and the global listener reads bindings from. Created and registered lazily on first call. */
export function getAppShortcuts(): ShortcutManager {
  if (manager === undefined) {
    manager = new ShortcutManager({ storageKey: STORAGE_KEY });
    registerAppShortcutActions(manager);
    const shared = manager;
    // Labels follow the language; keys and overrides are untouched.
    onLocaleChange(() => registerAppShortcutActions(shared));
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
