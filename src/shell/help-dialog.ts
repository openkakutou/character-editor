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
  heading.tabIndex = -1;

  const intro = document.createElement("p");

  const navTitle = document.createElement("h3");
  const navList = document.createElement("table");
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
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const text of [
      t("help.colShortcut", "Shortcut"),
      t("help.colAction", "Action"),
    ]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = text;
      headRow.appendChild(cell);
    }
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    body.append(
      ...SECTION_IDS.map((id) => {
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        const keys = document.createElement("kbd");
        keys.textContent = `Alt+${sectionNumber(id)}`;
        keyCell.appendChild(keys);
        const action = document.createElement("td");
        action.textContent = t("help.nav", "Go to section {{n}}: {{title}}", {
          n: String(sectionNumber(id)),
          title: sectionTitle(id),
        });
        row.append(keyCell, action);
        return row;
      }),
    );
    navList.replaceChildren(head, body);
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
      if (dialog.hasAttribute("open")) return;
      dialog.showModal();
      // Focus starts on the title, ahead of the long list of controls.
      heading.focus();
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
