// A single global keydown listener that resolves a pressed key combo to a
// registered app shortcut action, then clicks the exact same DOM button
// that action's own toolbar/panel control already renders -- see
// `.vibe/decisions/014-shortcut-manager-scope-and-wiring.md`. No action
// logic is duplicated here: this module only ever calls `.click()`.
import type { ShortcutManager } from "@openkakutou/web-ui-kit";
import { getAppShortcuts } from "./app-shortcuts.ts";

const MODIFIER_KEY_NAMES = new Set(["Shift", "Control", "Alt", "Meta"]);

interface ComboSourceEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Builds the same combo string format `@openkakutou/web-ui-kit`'s
 * `<wuik-shortcuts-panel>` produces and `ShortcutManager` stores (e.g.
 * `"Ctrl+Shift+S"`) -- re-implemented here because that normalization is an
 * internal detail of the shared kit, not part of its exported public API
 * (only `ShortcutManager` and `WuikShortcutsPanelElement` are). Modifier
 * order is always Ctrl, Meta, Alt, Shift. Returns `undefined` when the event
 * is a modifier key pressed on its own -- not a usable shortcut yet.
 */
export function normalizeShortcutEvent(
  event: ComboSourceEvent,
): string | undefined {
  if (MODIFIER_KEY_NAMES.has(event.key)) {
    return undefined;
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join("+");
}

/**
 * True when a global shortcut must not act on this event's target: a
 * text-editable control (never hijack typing or a text field's own native
 * undo/redo), or the shared `<wuik-shortcuts-panel>` itself (its own
 * rebind-capture keydown, retargeted to the host element across the shadow
 * boundary, must not also trigger the very action being rebound).
 */
export function shouldIgnoreGlobalShortcut(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.tagName === "WUIK-SHORTCUTS-PANEL") {
    return true;
  }
  // Checked via the raw attribute rather than `isContentEditable` --
  // unimplemented in this project's jsdom test environment (returns
  // `undefined`, not even a boolean), the same "unimplemented browser
  // effect" category as `HTMLCanvasElement.getContext`/`DataTransfer`.
  const contentEditableAttr = target.getAttribute("contenteditable");
  if (contentEditableAttr !== null && contentEditableAttr !== "false") {
    return true;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export interface GlobalShortcutListenerOptions {
  /** @default getAppShortcuts() */
  manager?: ShortcutManager;
  /** @default window */
  target?: EventTarget;
  /** Resolves an action id to the button that performs it. @default `document.querySelector('[data-action="<id>"]')` */
  findActionButton?: (actionId: string) => HTMLElement | null;
}

function defaultFindActionButton(actionId: string): HTMLElement | null {
  return document.querySelector(`[data-action="${actionId}"]`);
}

/**
 * Installs the app-wide shortcut keydown listener. Returns a function that
 * removes it -- called once at bootstrap in production (mirroring
 * `history/unsaved-changes-guard.ts`'s own "install once, not per render"
 * convention), and by each test that installs one to avoid stacking
 * listeners on a shared target like `window`.
 */
export function installGlobalShortcutListener(
  options: GlobalShortcutListenerOptions = {},
): () => void {
  const manager = options.manager ?? getAppShortcuts();
  const target = options.target ?? window;
  const findActionButton = options.findActionButton ?? defaultFindActionButton;

  function handleKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (shouldIgnoreGlobalShortcut(keyboardEvent.target)) {
      return;
    }

    const combo = normalizeShortcutEvent(keyboardEvent);
    if (combo === undefined) {
      return;
    }

    const binding = manager.list().find((b) => b.key === combo);
    if (binding === undefined) {
      return;
    }

    const button = findActionButton(binding.id);
    if (button === null) {
      return;
    }

    keyboardEvent.preventDefault();
    button.click();
  }

  target.addEventListener("keydown", handleKeydown);
  return () => target.removeEventListener("keydown", handleKeydown);
}
