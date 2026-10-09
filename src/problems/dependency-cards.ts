// A section that needs a file or the engine that is not available shows a
// message card in place of its editor (UX flow 002, pattern 1): the editor
// never renders as if the data were empty, so nothing can be edited -- and
// later exported -- on top of a gap. The card carries the same Replace file /
// Retry action as the banner, from the same registry state.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { sectionTitle } from "../shell/section-text.ts";
import type { SectionId } from "../shell/sections.ts";
import { type ProblemView, createProblemView } from "./problem-view.ts";
import { problemSentence } from "./problem.ts";
import {
  type BannerEngine,
  type BannerFile,
  fileProblem,
} from "./problems-banner.ts";
import type { UnreadableKind } from "./replace-file.ts";

/** The sections that cannot work without a given file. */
export const SECTION_NEEDING_FILE: Readonly<
  Partial<Record<UnreadableKind, SectionId>>
> = {
  sff: "sprites",
  snd: "sounds",
  cmd: "commands",
  zss: "states",
};

/** Sections that also read the sprite sheet: they cannot work against its blank stand-in. */
const ALSO_NEEDING_SFF: readonly SectionId[] = ["palettes", "animations"];

/** The sections that cannot work without the engine. */
export const SECTIONS_NEEDING_ENGINE: readonly SectionId[] = [
  "sprites",
  "palettes",
  "animations",
];

function needsFile(kind: UnreadableKind, section: SectionId): boolean {
  return (
    SECTION_NEEDING_FILE[kind] === section ||
    (kind === "sff" && ALSO_NEEDING_SFF.includes(section))
  );
}

export interface DependencyState {
  files: readonly BannerFile[];
  engine?: BannerEngine;
}

export interface DependencyCardsOptions {
  onReplace: (file: BannerFile["file"]) => void;
  onRetryEngine: () => void;
}

export interface DependencyCards {
  update(state: DependencyState): void;
  destroy(): void;
}

let nextId = 0;

interface Card {
  section: SectionId;
  element: HTMLElement;
  title: HTMLElement;
  views: Map<string, ProblemView>;
}

export function createDependencyCards(
  containers: Readonly<Record<SectionId, HTMLElement>>,
  options: DependencyCardsOptions,
): DependencyCards {
  const cards = new Map<SectionId, Card>();
  let state: DependencyState = { files: [] };

  function ensureCard(section: SectionId): Card {
    const existing = cards.get(section);
    if (existing) return existing;
    const element = document.createElement("section");
    element.className = "dependency-card";
    const title = document.createElement("h3");
    title.id = `dependency-card-${++nextId}`;
    title.className = "dependency-card__title";
    element.setAttribute("aria-labelledby", title.id);
    const card: Card = { section, element, title, views: new Map() };
    cards.set(section, card);
    return card;
  }

  function dropCard(section: SectionId): void {
    const card = cards.get(section);
    if (!card) return;
    card.element.remove();
    cards.delete(section);
    containers[section].removeAttribute("data-blocked");
  }

  function renderFile(card: Card, entry: BannerFile): HTMLElement {
    const block = document.createElement("div");
    block.className = "dependency-card__block";
    const key = `file:${entry.file.kind}`;
    let view = card.views.get(key);
    const problem = fileProblem(entry);
    if (view === undefined) {
      view = createProblemView(problem);
      card.views.set(key, view);
    } else {
      view.setProblem(problem);
    }
    const replace = document.createElement("wuik-button");
    replace.setAttribute("variant", "primary");
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
    block.append(view.element, replace);
    return block;
  }

  function renderEngine(card: Card, engine: BannerEngine): HTMLElement {
    const block = document.createElement("div");
    block.className = "dependency-card__block";
    const sentence = document.createElement("p");
    sentence.textContent = problemSentence(engine.problem);
    let view = card.views.get("engine");
    if (view === undefined) {
      view = createProblemView(engine.problem, { detailsOnly: true });
      card.views.set("engine", view);
    } else {
      view.setProblem(engine.problem);
    }
    const retry = document.createElement("wuik-button");
    retry.setAttribute("variant", "primary");
    retry.dataset.action = "retry-engine";
    retry.textContent = engine.busy
      ? t("banner.retrying", "Retrying…")
      : t("banner.retry", "Retry");
    if (engine.busy) retry.setAttribute("aria-disabled", "true");
    retry.addEventListener("click", () => {
      if (!state.engine?.busy) options.onRetryEngine();
    });
    block.append(sentence, retry, view.element);
    return block;
  }

  function render(): void {
    const wanted = new Set<SectionId>();
    for (const entry of state.files) {
      const section = SECTION_NEEDING_FILE[entry.file.kind];
      if (section) wanted.add(section);
      if (entry.file.kind === "sff") {
        for (const other of ALSO_NEEDING_SFF) wanted.add(other);
      }
    }
    if (state.engine) {
      for (const section of SECTIONS_NEEDING_ENGINE) wanted.add(section);
    }
    for (const section of [...cards.keys()]) {
      if (!wanted.has(section)) dropCard(section);
    }

    for (const section of wanted) {
      const card = ensureCard(section);
      const focused = card.element.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      const focusAction =
        focused?.closest<HTMLElement>("[data-action]")?.dataset.action;
      card.title.textContent = t(
        state.engine &&
          !state.files.some((entry) => needsFile(entry.file.kind, section))
          ? "errors.dependency.engineTitle"
          : "errors.dependency.title",
        state.engine &&
          !state.files.some((entry) => needsFile(entry.file.kind, section))
          ? "{{section}} needs the editor engine"
          : "{{section}} can't be shown",
        { section: sectionTitle(section) },
      );
      const blocks: HTMLElement[] = [];
      for (const entry of state.files) {
        if (needsFile(entry.file.kind, section)) {
          blocks.push(renderFile(card, entry));
        }
      }
      if (state.engine && SECTIONS_NEEDING_ENGINE.includes(section)) {
        blocks.push(renderEngine(card, state.engine));
      }
      card.element.replaceChildren(card.title, ...blocks);
      const container = containers[section];
      container.setAttribute("data-blocked", "true");
      if (card.element.parentElement !== container) {
        container.prepend(card.element);
      }
      if (focusAction !== undefined) {
        const target = card.element.querySelector<HTMLElement>(
          `[data-action="${focusAction}"]`,
        );
        (target?.shadowRoot?.querySelector("button") ?? target)?.focus();
      }
    }
  }

  const stopLocale = onLocaleChange(() => {
    for (const card of cards.values()) {
      for (const view of card.views.values()) view.refresh();
    }
    render();
  });

  return {
    update(next) {
      state = next;
      render();
    },
    destroy() {
      stopLocale();
      for (const section of [...cards.keys()]) dropCard(section);
    },
  };
}
