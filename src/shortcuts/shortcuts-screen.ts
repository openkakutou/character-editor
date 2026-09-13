// The "Keyboard shortcuts" screen (backlog item 011): mounts
// `@openkakutou/web-ui-kit`'s shared `<wuik-shortcuts-panel>` bound to this
// app's shared manager, so a user can see and rebind every registered
// action. Rendered as an always-visible inline section in `main.ts`, like
// every other screen -- not gated behind a loaded character (its actions,
// Undo/Redo/Save chief among them, are relevant before one is even loaded)
// and not a modal, per .vibe/decisions/014.
import type { ShortcutManager } from "@openkakutou/web-ui-kit";
import { getAppShortcuts } from "./app-shortcuts.ts";

export interface ShortcutsScreenOptions {
  /** @default getAppShortcuts() */
  manager?: ShortcutManager;
}

/** Renders the "Keyboard shortcuts" screen into `root`, replacing its previous content. */
export function renderShortcutsScreen(
  root: HTMLElement,
  options: ShortcutsScreenOptions = {},
): void {
  root.replaceChildren();

  const manager = options.manager ?? getAppShortcuts();

  const container = document.createElement("div");
  container.className = "shortcuts-screen";

  const heading = document.createElement("h2");
  heading.textContent = "Keyboard shortcuts";
  container.appendChild(heading);

  const panel = document.createElement(
    "wuik-shortcuts-panel",
  ) as HTMLElement & {
    manager?: ShortcutManager;
  };
  panel.manager = manager;
  container.appendChild(panel);

  root.appendChild(container);
}
