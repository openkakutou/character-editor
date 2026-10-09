// One problem as the user reads it (UX flow 002, shared by the banner, the
// Home screen, the wizard dialog and the section messages): the word "Error"
// next to an icon, the localized title, cause and next step, and a "Show
// details" disclosure holding the raw technical text with "Copy details".
// Plain DOM with no live attribute -- a failure is announced once, by the
// caller, through the shell's alert region.
import { t } from "../i18n/i18n.ts";
import { type Problem, describeProblem } from "./problem.ts";

export interface ProblemView {
  readonly element: HTMLElement;
  /** Shows another problem, keeping the details disclosure as it is. */
  setProblem(problem: Problem): void;
  /** Re-resolves the localized texts, e.g. after a language switch. */
  refresh(): void;
  /** Moves keyboard focus to the problem summary. */
  focus(): void;
}

let nextId = 0;

export interface ProblemViewOptions {
  /** Shows only the "Show details" tools: the caller already states the message. */
  detailsOnly?: boolean;
}

export function createProblemView(
  initial: Problem,
  viewOptions: ProblemViewOptions = {},
): ProblemView {
  const id = `problem-${++nextId}`;
  let problem = initial;
  let copiedTimer: number | undefined;

  const element = document.createElement("div");
  element.className = "problem";
  element.tabIndex = -1;

  const head = document.createElement("p");
  head.className = "problem__head";
  const icon = document.createElement("span");
  icon.className = "problem__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⚠";
  const label = document.createElement("span");
  label.className = "problem__label";
  const title = document.createElement("strong");
  title.className = "problem__title";
  head.append(icon, label, title);

  const cause = document.createElement("p");
  cause.className = "problem__cause";
  const action = document.createElement("p");
  action.className = "problem__action";

  const tools = document.createElement("div");
  tools.className = "problem__tools";
  const toggle = document.createElement("wuik-button");
  toggle.setAttribute("variant", "ghost");
  toggle.dataset.action = "toggle-details";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", `${id}-detail`);
  const copy = document.createElement("wuik-button");
  copy.setAttribute("variant", "ghost");
  copy.dataset.action = "copy-details";
  tools.append(toggle, copy);

  const detail = document.createElement("pre");
  detail.className = "problem__detail";
  detail.id = `${id}-detail`;
  detail.hidden = true;

  element.append(head, cause, action, tools, detail);

  function render(): void {
    const text = describeProblem(problem);
    label.textContent = `${t("errors.label", "Error")} — `;
    title.textContent = text.title;
    cause.textContent = text.cause ?? "";
    head.hidden = viewOptions.detailsOnly === true;
    cause.hidden = viewOptions.detailsOnly === true || text.cause === undefined;
    action.textContent = text.action ?? "";
    action.hidden =
      viewOptions.detailsOnly === true || text.action === undefined;

    const hasDetail = problem.detail !== undefined && problem.detail !== "";
    tools.hidden = !hasDetail;
    detail.textContent = problem.detail ?? "";
    if (!hasDetail) detail.hidden = true;
    const expanded = !detail.hidden;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded
      ? t("errors.details.hide", "Hide details")
      : t("errors.details.show", "Show details");
    if (copiedTimer === undefined) {
      copy.textContent = t("errors.details.copy", "Copy details");
    } else {
      copy.textContent = t("errors.details.copied", "Copied");
    }
  }

  toggle.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
    render();
  });

  copy.addEventListener("click", () => {
    const text = problem.detail ?? "";
    const done = (): void => {
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        copiedTimer = undefined;
        render();
      }, 2000);
      render();
    };
    // Clipboard access can be refused: show the text so it can be selected.
    const showInstead = (): void => {
      detail.hidden = false;
      render();
    };
    if (navigator.clipboard === undefined) {
      showInstead();
      return;
    }
    navigator.clipboard.writeText(text).then(done, showInstead);
  });

  render();

  return {
    element,
    setProblem(next) {
      problem = next;
      render();
    },
    refresh: render,
    focus() {
      element.focus();
    },
  };
}
