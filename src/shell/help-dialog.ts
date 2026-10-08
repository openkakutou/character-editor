// The help dialog (UX flow 001, screen shortcuts-help): how the editor is
// organised, the navigation shortcuts, and the remappable shortcut panel that
// used to sit above the editors. Opened by the Help button or `?`.
import type { ShortcutManager } from "@openkakutou/web-ui-kit";
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { getAppShortcuts } from "../shortcuts/app-shortcuts.ts";
import { sectionTitle } from "./section-text.ts";
import { SECTION_IDS, sectionNumber } from "./sections.ts";

export interface HelpDialog {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  destroy(): void;
}

interface DialogElement extends HTMLElement {
  open: boolean;
  showModal(): void;
  close(): void;
}

export function createHelpDialog(
  manager: ShortcutManager = getAppShortcuts(),
): HelpDialog {
  const dialog = document.createElement("wuik-dialog") as DialogElement;
  dialog.className = "help-dialog";

  const heading = document.createElement("h2");
  heading.slot = "heading";

  const intro = document.createElement("p");

  const navTitle = document.createElement("h3");
  const navList = document.createElement("ul");
  navList.className = "help-dialog__nav";

  const openNote = document.createElement("p");
  const panelTitle = document.createElement("h3");
  const panel = document.createElement(
    "wuik-shortcuts-panel",
  ) as HTMLElement & {
    manager?: ShortcutManager;
  };
  panel.manager = manager;

  dialog.append(heading, intro, navTitle, navList, openNote, panelTitle, panel);

  function renderText(): void {
    heading.textContent = t("help.title", "Keyboard shortcuts");
    intro.textContent = t(
      "help.intro",
      "The editor shows one section at a time. Pick a section in the left bar; your work in the other sections is kept.",
    );
    navTitle.textContent = t("help.navigation", "Navigation");
    navList.replaceChildren(
      ...SECTION_IDS.map((id) => {
        const item = document.createElement("li");
        const keys = document.createElement("kbd");
        keys.textContent = `Alt+${sectionNumber(id)}`;
        item.append(
          keys,
          document.createTextNode(
            ` ${t("help.nav", "Go to section {{n}}", { n: String(sectionNumber(id)) })} — ${sectionTitle(id)}`,
          ),
        );
        return item;
      }),
    );
    openNote.textContent = t(
      "help.openHint",
      "Press ? outside a text field to open this dialog.",
    );
    panelTitle.textContent = t("help.editing", "Editing and output");
  }
  renderText();
  const stopLocale = onLocaleChange(renderText);

  return {
    element: dialog,
    get isOpen() {
      return dialog.hasAttribute("open");
    },
    open() {
      if (!dialog.hasAttribute("open")) dialog.showModal();
    },
    close() {
      if (dialog.hasAttribute("open")) dialog.close();
    },
    destroy() {
      stopLocale();
      dialog.remove();
    },
  };
}
