// The confirmation shown when leaving a character with changes that were not
// exported (UX flow 001, screen leave-dialog): Export first, Discard or
// Cancel, with Cancel focused so a stray Enter never loses work.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import type { ExportController } from "../save/export-controller.ts";

export interface LeaveDialog {
  readonly element: HTMLElement;
  /** Opens the dialog; resolves `true` when the user may leave (exported or discarded), `false` on cancel. */
  confirm(): Promise<boolean>;
  destroy(): void;
}

interface DialogElement extends HTMLElement {
  showModal(): void;
  close(): void;
}

function actionButton(
  action: string,
  variant: "primary" | "secondary" | "danger",
): HTMLElement {
  const el = document.createElement("wuik-button");
  el.setAttribute("variant", variant);
  el.dataset.action = action;
  return el;
}

export function createLeaveDialog(
  controller: ExportController,
  /** Asked before an export starts; `false` keeps the user in the dialog. */
  beforeExport: () => Promise<boolean> = async () => true,
): LeaveDialog {
  const dialog = document.createElement("wuik-dialog") as DialogElement;
  dialog.className = "leave-dialog";
  dialog.setAttribute("role", "alertdialog");

  const heading = document.createElement("h2");
  heading.slot = "heading";
  const body = document.createElement("p");
  const message = document.createElement("p");
  message.className = "leave-dialog__message";
  message.setAttribute("role", "alert");
  const actions = document.createElement("div");
  actions.className = "leave-dialog__actions";
  const cancel = actionButton("leave-cancel", "secondary");
  const discard = actionButton("leave-discard", "danger");
  const exportFirst = actionButton("leave-export", "primary");
  // Cancel first in the tab order, so it is the focused default.
  actions.append(cancel, discard, exportFirst);
  dialog.append(heading, body, message, actions);

  let resolveChoice: ((leave: boolean) => void) | undefined;
  let busy = false;

  function finish(leave: boolean): void {
    const resolve = resolveChoice;
    resolveChoice = undefined;
    dialog.close();
    resolve?.(leave);
  }

  function setBusy(next: boolean): void {
    busy = next;
    for (const el of [cancel, discard, exportFirst]) {
      el.toggleAttribute("disabled", next);
    }
  }

  function renderText(): void {
    heading.textContent = t("leave.title", "Leave this character?");
    body.textContent = t(
      "leave.body",
      "Changes since the last export will be lost.",
    );
    cancel.textContent = t("leave.cancel", "Cancel");
    discard.textContent = t("leave.discard", "Discard changes");
    const state = controller.state;
    exportFirst.textContent =
      state.phase === "running" && state.total > 0
        ? t("export.running", "Export {{done}}/{{total}}", {
            done: String(state.done),
            total: String(state.total),
          })
        : t("leave.exportFirst", "Export first");
  }
  renderText();

  cancel.addEventListener("click", () => finish(false));
  discard.addEventListener("click", () => finish(true));
  exportFirst.addEventListener("click", async () => {
    message.textContent = "";
    if (!(await beforeExport())) return;
    setBusy(true);
    await controller.run();
    setBusy(false);
    const state = controller.state;
    if (state.phase === "saved") {
      finish(true);
    } else if (state.phase === "error") {
      message.textContent = state.message;
    }
  });
  // Escape and backdrop close the dialog itself: that is a cancel.
  dialog.addEventListener("wuik-close", () => {
    if (busy) return;
    const resolve = resolveChoice;
    resolveChoice = undefined;
    resolve?.(false);
  });

  const stopProgress = controller.subscribe(renderText);
  const stopLocale = onLocaleChange(renderText);

  return {
    element: dialog,
    confirm() {
      message.textContent = "";
      renderText();
      return new Promise<boolean>((resolve) => {
        resolveChoice = resolve;
        dialog.showModal();
        // The kit focuses the first native control it finds, which is not one
        // of these shadow-hosted buttons: put the safe choice under focus.
        cancel.shadowRoot?.querySelector("button")?.focus();
      });
    },
    destroy() {
      stopProgress();
      stopLocale();
      dialog.remove();
    },
  };
}
