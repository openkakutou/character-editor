// The confirmation shown when exporting while some files could not be read
// (UX flow 002, step 5): it names the files left out, so nothing is exported
// as if it were complete. Cancel is the focused default.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";

export interface ExportConfirmDialog {
  readonly element: HTMLElement;
  /** Opens the dialog naming `fileNames`; resolves `true` to export anyway, `false` on cancel. */
  confirm(fileNames: readonly string[]): Promise<boolean>;
  destroy(): void;
}

interface DialogElement extends HTMLElement {
  showModal(): void;
  close(): void;
}

function actionButton(
  action: string,
  variant: "primary" | "secondary",
): HTMLElement {
  const el = document.createElement("wuik-button");
  el.setAttribute("variant", variant);
  el.dataset.action = action;
  return el;
}

export function createExportConfirmDialog(): ExportConfirmDialog {
  const dialog = document.createElement("wuik-dialog") as DialogElement;
  dialog.className = "export-confirm-dialog";
  dialog.setAttribute("role", "alertdialog");

  const heading = document.createElement("h2");
  heading.slot = "heading";
  const body = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "leave-dialog__actions";
  const cancel = actionButton("export-confirm-cancel", "secondary");
  const proceed = actionButton("export-confirm-proceed", "primary");
  // Cancel first in the tab order, so it is the focused default.
  actions.append(cancel, proceed);
  heading.id = "export-confirm-title";
  body.id = "export-confirm-body";
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.setAttribute("aria-describedby", body.id);
  dialog.append(heading, body, actions);

  let names: readonly string[] = [];
  let resolveChoice: ((proceed: boolean) => void) | undefined;

  function renderText(): void {
    heading.textContent = t(
      "exportConfirm.title",
      "Export with missing files?",
    );
    body.textContent = tCount(
      "exportConfirm.body",
      names.length,
      {
        one: "This file could not be read and will be left out: {{names}}. The exported character will be incomplete.",
        other: "These files could not be read and will be left out: {{names}}.",
      },
      { names: names.join(", ") },
    );
    cancel.textContent = t("exportConfirm.cancel", "Cancel");
    proceed.textContent = t("exportConfirm.confirm", "Export anyway");
  }
  renderText();

  function finish(value: boolean): void {
    const resolve = resolveChoice;
    resolveChoice = undefined;
    dialog.close();
    resolve?.(value);
  }

  cancel.addEventListener("click", () => finish(false));
  proceed.addEventListener("click", () => finish(true));
  // Escape and backdrop close the dialog itself: that is a cancel.
  dialog.addEventListener("wuik-close", () => {
    const resolve = resolveChoice;
    resolveChoice = undefined;
    resolve?.(false);
  });

  const stopLocale = onLocaleChange(renderText);

  return {
    element: dialog,
    confirm(fileNames) {
      names = fileNames;
      renderText();
      return new Promise<boolean>((resolve) => {
        resolveChoice = resolve;
        dialog.showModal();
        cancel.shadowRoot?.querySelector("button")?.focus();
      });
    },
    destroy() {
      stopLocale();
      dialog.remove();
    },
  };
}
