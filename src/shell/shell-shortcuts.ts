// Keyboard routes of the shell that are not remappable actions: Alt+1…8 to
// reach a section and `?` for help. Alt+digit is an accelerator only (the
// browser or the OS may take it); the sidebar stays the primary route.
import { digitFromKeyCode, sectionForDigit } from "./sections.ts";
import type { SectionId } from "./sections.ts";

export interface ShellShortcutOptions {
  /** Whether the shell (not the home screen) is showing. */
  isShellVisible: () => boolean;
  /** Whether a modal dialog or the drawer is open: shortcuts then do nothing. */
  isModalOpen: () => boolean;
  goTo: (id: SectionId) => void;
  openHelp: () => void;
}

function isEditable(origin: EventTarget | null): boolean {
  if (!(origin instanceof Element)) return false;
  const contentEditable = origin.getAttribute("contenteditable");
  if (contentEditable !== null && contentEditable !== "false") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(origin.tagName);
}

/** Installs the listener on `window`; returns a function that removes it. */
export function installShellShortcuts(
  options: ShellShortcutOptions,
): () => void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || options.isModalOpen()) return;
    const origin = event.composedPath?.()[0] ?? event.target;

    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const digit = digitFromKeyCode(event.code);
      const section = digit === undefined ? undefined : sectionForDigit(digit);
      if (section !== undefined && options.isShellVisible()) {
        event.preventDefault();
        options.goTo(section);
      }
      return;
    }

    if (
      event.key === "?" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isEditable(origin)
    ) {
      event.preventDefault();
      options.openHelp();
    }
  }
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}
