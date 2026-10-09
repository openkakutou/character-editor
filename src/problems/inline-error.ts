// The error shown right under the control whose action failed (UX flow 002,
// pattern 2): a sprite or palette that could not be imported. It names what
// failed, what to do, and keeps the raw text behind "Show details". A Dismiss
// button clears it, since it describes a failed action, not document state.
// The message is plain DOM with no live attribute; the registry sink is told
// once, so the badge counts it and the shell announces it.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import type { SectionId } from "../shell/sections.ts";
import { type ProblemView, createProblemView } from "./problem-view.ts";
import type { Problem } from "./problem.ts";

/** Where editors report action failures; main turns them into registry issues (source `action`). */
export interface ProblemSink {
  report(section: SectionId, key: string, problem: Problem): void;
  clear(section: SectionId, key: string): void;
}

export interface InlineError {
  readonly element: HTMLElement;
  /** Shows `problem`; the control it belongs to should reference `element.id` as its description. */
  show(problem: Problem): void;
  clear(): void;
  readonly shown: boolean;
  destroy(): void;
}

let nextId = 0;

export function createInlineError(options: {
  section: SectionId;
  key: string;
  sink?: ProblemSink;
  /** Called when the error is dismissed, so focus can go back to the control that failed. */
  onDismiss?: () => void;
}): InlineError {
  const element = document.createElement("div");
  element.className = "inline-error";
  element.id = `inline-error-${++nextId}`;
  element.hidden = true;
  let view: ProblemView | null = null;

  const dismiss = document.createElement("wuik-button");
  dismiss.setAttribute("variant", "ghost");
  dismiss.dataset.action = "dismiss-error";

  function renderText(): void {
    dismiss.textContent = t("errors.dismiss", "Dismiss");
  }

  function clear(): void {
    if (element.hidden) return;
    element.hidden = true;
    options.sink?.clear(options.section, options.key);
  }

  dismiss.addEventListener("click", () => {
    clear();
    options.onDismiss?.();
  });

  const stopLocale = onLocaleChange(renderText);
  renderText();

  return {
    element,
    show(problem) {
      if (view === null) {
        view = createProblemView(problem);
        element.replaceChildren(view.element, dismiss);
      } else {
        view.setProblem(problem);
      }
      element.hidden = false;
      options.sink?.report(options.section, options.key, problem);
    },
    clear,
    get shown() {
      return !element.hidden;
    },
    destroy() {
      stopLocale();
      options.sink?.clear(options.section, options.key);
    },
  };
}
