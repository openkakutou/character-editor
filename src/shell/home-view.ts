// The home screen (UX flow 001, screen home): shown before a character is
// open. A centred column with the product name, one sentence, the folder drop
// zone, Open folder and New character; the only chrome is language and theme.
import type { WuikLocaleSwitcherElement } from "@openkakutou/web-ui-kit";
import { getI18n, onLocaleChange, t } from "../i18n/i18n.ts";
import {
  type CharacterFileInputViewOptions,
  renderCharacterFileInput,
} from "../input/character-file-input-view.ts";
import {
  type NewCharacterWizardOptions,
  renderNewCharacterWizard,
} from "../wizard/new-character-wizard-view.ts";
import { createThemeToggle } from "./theme-toggle.ts";

const APP_TITLE = "Character Editor";

export interface HomeViewOptions {
  fileInput: CharacterFileInputViewOptions;
  wizard: NewCharacterWizardOptions;
}

export interface HomeView {
  readonly element: HTMLElement;
  /** Puts the folder input back to its initial, empty state. */
  reset(): void;
  /** Moves keyboard focus to the title. */
  focusTitle(): void;
  destroy(): void;
}

export function createHomeView(options: HomeViewOptions): HomeView {
  const element = document.createElement("div");
  element.className = "home";

  const chrome = document.createElement("div");
  chrome.className = "home__chrome";
  const localeSwitcher = document.createElement(
    "wuik-locale-switcher",
  ) as unknown as WuikLocaleSwitcherElement;
  localeSwitcher.className = "locale-switcher";
  localeSwitcher.i18n = getI18n();
  const themeToggle = createThemeToggle();
  chrome.append(localeSwitcher, themeToggle.element);

  const column = document.createElement("main");
  column.className = "home__column";
  const title = document.createElement("h1");
  title.className = "home__title";
  title.tabIndex = -1;
  const hint = document.createElement("p");
  hint.className = "home__hint";
  const inputRoot = document.createElement("div");
  const wizardRoot = document.createElement("div");
  const note = document.createElement("p");
  note.className = "home__note";
  column.append(title, hint, inputRoot, note);
  element.append(chrome, column);

  function mount(): void {
    renderNewCharacterWizard(wizardRoot, options.wizard);
    renderCharacterFileInput(inputRoot, {
      ...options.fileInput,
      extraActions: [wizardRoot],
    });
  }

  function renderText(): void {
    document.title = t("home.title", APP_TITLE);
    localeSwitcher.setAttribute("label", t("app.languageLabel", "Language"));
    title.textContent = t("home.title", APP_TITLE);
    hint.textContent = t(
      "home.hint",
      "Drop a character folder, or start from scratch.",
    );
    note.textContent = t(
      "home.save.note.export",
      "Changes are saved by exporting.",
    );
  }

  renderText();
  mount();
  const stopLocale = onLocaleChange(renderText);

  return {
    element,
    reset: mount,
    focusTitle() {
      title.focus();
    },
    destroy() {
      stopLocale();
      themeToggle.destroy();
      element.remove();
    },
  };
}
