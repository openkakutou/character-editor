// The placeholder shown where a preview could not be produced (UX flow 002,
// pattern 3): text that names what failed and the next step, a real Retry
// button in the tab order (never inside the canvas), and a disclosure for the
// raw technical text. When the preview still holds an earlier good frame, that
// frame stays visible, dimmed, and the placeholder says it is outdated.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { type ProblemView, createProblemView } from "./problem-view.ts";

export interface PreviewFailure {
  readonly element: HTMLElement;
  /** Shows the failure; `outdated` when a dimmed earlier frame is still on screen. */
  show(detail: string, outdated: boolean): void;
  hide(): void;
  readonly shown: boolean;
  destroy(): void;
}

export function createPreviewFailure(onRetry: () => void): PreviewFailure {
  const element = document.createElement("div");
  element.className = "preview-failure";
  element.hidden = true;

  const outdatedNote = document.createElement("p");
  outdatedNote.className = "preview-failure__outdated";
  const retry = document.createElement("wuik-button");
  retry.setAttribute("variant", "secondary");
  retry.dataset.action = "retry-preview";
  let view: ProblemView | null = null;
  let outdated = false;

  function renderText(): void {
    outdatedNote.textContent = t("errors.preview.outdated", "Outdated preview");
    outdatedNote.hidden = !outdated;
    retry.textContent = t("errors.preview.retry", "Retry");
  }

  retry.addEventListener("click", () => onRetry());

  const stopLocale = onLocaleChange(renderText);
  renderText();

  return {
    element,
    show(detail, isOutdated) {
      outdated = isOutdated;
      const problem = { code: "preview.failed" as const, params: {}, detail };
      if (view === null) {
        view = createProblemView(problem);
        element.replaceChildren(outdatedNote, view.element, retry);
      } else {
        view.setProblem(problem);
      }
      renderText();
      element.hidden = false;
    },
    hide() {
      element.hidden = true;
    },
    get shown() {
      return !element.hidden;
    },
    destroy: stopLocale,
  };
}
