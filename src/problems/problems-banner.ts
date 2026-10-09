// The banner under the toolbar (UX flow 002, screen problems-banner): it
// tells the user once, and persistently, about problems that affect the whole
// session -- the engine that did not load, files that could not be read --
// and lets them fix those without leaving their work. It is one of three
// views of the same registry fact (the others being the section message and
// the sidebar badge); it only renders the state it is given.
//
// The region is absent from the page while there is nothing to report. It is
// collapsible but never dismissable while problems remain. It carries no live
// attribute: the caller announces appearance once through the shell.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import type { UnreadableFile } from "../input/character-file-input.ts";
import { type ProblemView, createProblemView } from "./problem-view.ts";
import { type Problem, describeProblem, problemSentence } from "./problem.ts";

export interface BannerFile {
  file: UnreadableFile;
  /** A replacement is being read and checked. */
  busy: boolean;
  /** Why the last replacement failed, shown on the row instead of the original cause. */
  failure?: Problem;
}

export interface BannerEngine {
  problem: Problem;
  /** A new attempt is in flight. */
  busy: boolean;
}

export interface BannerState {
  files: readonly BannerFile[];
  engine?: BannerEngine;
}

export interface ProblemsBannerOptions {
  onReplace: (file: UnreadableFile) => void;
  onRetryEngine: () => void;
}

export interface ProblemsBanner {
  /** Replaces what is shown, keeping the collapsed state and the focused control. */
  setState(state: BannerState): void;
  /** Moves keyboard focus to the banner heading, when the banner is shown. */
  focusHeading(): void;
  /** Moves keyboard focus to the first row's Replace button; false when there is none. */
  focusFirstReplace(): boolean;
  destroy(): void;
}

let nextId = 0;

/** The problem a row reports: the original unreadable file, or why the last replacement failed. */
export function fileProblem(entry: BannerFile): Problem {
  return (
    entry.failure ?? {
      code: "file.unreadable",
      params: { fileName: entry.file.fileName },
      detail: entry.file.detail,
    }
  );
}

function keyOf(file: UnreadableFile): string {
  return `file:${file.kind}`;
}

function innerButton(host: HTMLElement): HTMLElement {
  return host.shadowRoot?.querySelector<HTMLElement>("button") ?? host;
}

export function createProblemsBanner(
  host: HTMLElement,
  options: ProblemsBannerOptions,
): ProblemsBanner {
  const id = `problems-banner-${++nextId}`;
  let state: BannerState = { files: [] };
  let collapsed = false;
  // Kept across renders so a row's open "Show details" survives an update.
  const rowViews = new Map<string, ProblemView>();

  const region = document.createElement("section");
  region.className = "problems-banner";
  region.setAttribute("aria-labelledby", `${id}-title`);

  const header = document.createElement("div");
  header.className = "problems-banner__header";
  const heading = document.createElement("h2");
  heading.className = "problems-banner__title";
  heading.id = `${id}-title`;
  heading.tabIndex = -1;
  const toggle = document.createElement("wuik-button");
  toggle.setAttribute("variant", "ghost");
  toggle.dataset.action = "toggle-banner";
  toggle.setAttribute("aria-controls", `${id}-body`);
  header.append(heading, toggle);

  const body = document.createElement("div");
  body.className = "problems-banner__body";
  body.id = `${id}-body`;
  region.append(header, body);

  function filesTitle(count: number): string {
    return tCount("banner.files.title", count, {
      one: "1 file could not be read",
      other: "{{count}} files could not be read",
    });
  }

  function renderEngine(engine: BannerEngine): HTMLElement {
    const section = document.createElement("div");
    section.className = "problems-banner__engine";
    section.dataset.key = "engine";
    const sentence = document.createElement("p");
    sentence.textContent = problemSentence(engine.problem);
    const retry = document.createElement("wuik-button");
    retry.setAttribute("variant", "primary");
    retry.dataset.action = "retry-engine";
    retry.textContent = engine.busy
      ? t("banner.retrying", "Retrying…")
      : t("banner.retry", "Retry");
    // Busy, not disabled: the button keeps keyboard focus while it works.
    if (engine.busy) retry.setAttribute("aria-disabled", "true");
    retry.addEventListener("click", () => {
      if (!state.engine?.busy) options.onRetryEngine();
    });
    const viewKey = "engine";
    let view = rowViews.get(viewKey);
    if (view === undefined) {
      view = createProblemView(engine.problem, { detailsOnly: true });
      rowViews.set(viewKey, view);
    } else {
      view.setProblem(engine.problem);
    }
    // The sentence above is the message: the view contributes just its disclosure.
    section.append(sentence, retry, view.element);
    return section;
  }

  function renderRow(entry: BannerFile): HTMLElement {
    const item = document.createElement("li");
    item.className = "problems-banner__row";
    item.dataset.key = keyOf(entry.file);
    const viewKey = keyOf(entry.file);
    let view = rowViews.get(viewKey);
    const problem = fileProblem(entry);
    if (view === undefined) {
      view = createProblemView(problem);
      rowViews.set(viewKey, view);
    } else {
      view.setProblem(problem);
    }
    const replace = document.createElement("wuik-button");
    replace.setAttribute("variant", "secondary");
    replace.dataset.action = "replace-file";
    replace.dataset.kind = entry.file.kind;
    replace.textContent = entry.busy
      ? t("banner.replacing", "Replacing…")
      : t("banner.replace", "Replace file");
    if (entry.busy) replace.setAttribute("aria-disabled", "true");
    replace.addEventListener("click", () => {
      const current = state.files.find(
        (candidate) => candidate.file.kind === entry.file.kind,
      );
      if (current && !current.busy) options.onReplace(current.file);
    });
    item.append(view.element, replace);
    return item;
  }

  let shownCount = 0;
  function render(): void {
    const hasEngine = state.engine !== undefined;
    const hasFiles = state.files.length > 0;
    const count = state.files.length + (hasEngine ? 1 : 0);
    // A new problem must never appear hidden behind a collapsed banner.
    if (count > shownCount) collapsed = false;
    shownCount = count;
    if (!hasEngine && !hasFiles) {
      rowViews.clear();
      host.replaceChildren();
      return;
    }

    const focused = region.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const focusKey =
      focused?.closest<HTMLElement>("[data-key]")?.dataset.key ??
      (focused === toggle ? "toggle" : undefined);
    const focusAction =
      focused?.closest<HTMLElement>("[data-action]")?.dataset.action;

    const engineTitle = state.engine
      ? describeProblem(state.engine.problem).title
      : "";
    heading.textContent = hasEngine
      ? engineTitle
      : filesTitle(state.files.length);

    toggle.textContent = collapsed
      ? t("banner.expand", "Expand")
      : t("banner.collapse", "Collapse");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    body.hidden = collapsed;

    const children: HTMLElement[] = [];
    if (state.engine) children.push(renderEngine(state.engine));
    if (hasFiles) {
      const files = document.createElement("div");
      files.className = "problems-banner__files";
      if (hasEngine) {
        const subtitle = document.createElement("h3");
        subtitle.textContent = filesTitle(state.files.length);
        files.append(subtitle);
      }
      const note = document.createElement("p");
      note.className = "problems-banner__note";
      note.textContent = t(
        "banner.files.note",
        "These files are left out of the export until you replace them.",
      );
      const list = document.createElement("ul");
      list.className = "problems-banner__list";
      list.append(...state.files.map(renderRow));
      files.append(note, list);
      children.push(files);
    }
    const stale = new Set(
      [...rowViews.keys()].filter(
        (key) =>
          key !== "engine" &&
          !state.files.some((entry) => keyOf(entry.file) === key),
      ),
    );
    for (const key of stale) rowViews.delete(key);
    if (!hasEngine) rowViews.delete("engine");
    body.replaceChildren(...children);
    if (region.parentElement !== host) host.replaceChildren(region);

    if (focusKey !== undefined) restoreFocus(focusKey, focusAction);
  }

  function restoreFocus(key: string, action: string | undefined): void {
    if (key === "toggle") {
      innerButton(toggle).focus();
      return;
    }
    const target = body.querySelector<HTMLElement>(
      `[data-key="${key}"] [data-action="${action ?? ""}"]`,
    );
    if (target) innerButton(target).focus();
  }

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    render();
  });

  const stopLocale = onLocaleChange(() => {
    for (const view of rowViews.values()) view.refresh();
    render();
  });

  return {
    setState(next) {
      state = next;
      render();
    },
    focusHeading() {
      if (region.isConnected) heading.focus();
    },
    focusFirstReplace() {
      const first = body.querySelector<HTMLElement>(
        '[data-action="replace-file"]',
      );
      if (first === null) return false;
      innerButton(first).focus();
      return true;
    },
    destroy() {
      stopLocale();
      host.replaceChildren();
    },
  };
}
