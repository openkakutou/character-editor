// The home screen (UX flow 001, screen home): shown before a character is
// open. A centred column with the product name, one sentence, the folder drop
// zone, Open folder and New character; the only chrome is language and theme.
import type { WuikLocaleSwitcherElement } from "@openkakutou/web-ui-kit";
import { getI18n, onLocaleChange, t } from "../i18n/i18n.ts";
import {
  type CharacterFileInputViewOptions,
  type UnsupportedVersionInfo,
  renderCharacterFileInput,
} from "../input/character-file-input-view.ts";
import { describeProblem } from "../problems/problem.ts";
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
  /** Replaces the column with the blocking "this version can't be opened" screen. */
  showVersionBlocked(info: UnsupportedVersionInfo): void;
  /** Announces a failure assertively. The shell is hidden here, so Home has its own live region. */
  alert(message: string): void;
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

  const alertRegion = document.createElement("div");
  alertRegion.className = "shell__live";
  alertRegion.setAttribute("role", "alert");
  let alertTimer: number | undefined;
  function alert(message: string): void {
    // Cleared first so an identical message is announced again.
    window.clearTimeout(alertTimer);
    alertRegion.textContent = "";
    alertTimer = window.setTimeout(() => {
      alertRegion.textContent = message;
    }, 50);
  }

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

  // The blocking screen for a file of a version this editor cannot open: it
  // replaces the column, nothing else is mounted, and it always leads back.
  const blocked = document.createElement("main");
  blocked.className = "home__column version-blocked";
  blocked.hidden = true;
  const blockedTitle = document.createElement("h1");
  blockedTitle.className = "home__title";
  blockedTitle.tabIndex = -1;
  const blockedCause = document.createElement("p");
  const versions = document.createElement("dl");
  versions.className = "version-blocked__versions";
  const blockedAction = document.createElement("p");
  const blockedButtons = document.createElement("div");
  blockedButtons.className = "file-input__actions";
  const backButton = document.createElement("wuik-button");
  backButton.setAttribute("variant", "primary");
  backButton.dataset.action = "version-back";
  const anotherButton = document.createElement("wuik-button");
  anotherButton.setAttribute("variant", "secondary");
  anotherButton.dataset.action = "version-another";
  blockedButtons.append(backButton, anotherButton);
  blocked.append(
    blockedTitle,
    blockedCause,
    versions,
    blockedAction,
    blockedButtons,
  );
  let blockedInfo: UnsupportedVersionInfo | null = null;

  function renderBlocked(): void {
    if (blockedInfo === null) return;
    const text = describeProblem({
      code: "format.unsupportedVersion",
      params: { fileName: blockedInfo.fileName, version: blockedInfo.version },
    });
    blockedTitle.textContent = text.title;
    blockedCause.textContent = text.cause ?? "";
    blockedAction.textContent = text.action ?? "";
    versions.replaceChildren();
    for (const [label, value] of [
      [t("version.found", "Found"), blockedInfo.version],
      [t("version.supported", "Supported"), blockedInfo.supported],
    ]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      versions.append(term, detail);
    }
    backButton.textContent = t("version.back", "Back to Home");
    anotherButton.textContent = t(
      "input.resetButton",
      "Choose a different folder",
    );
  }

  function leaveBlocked(): void {
    blockedInfo = null;
    blocked.hidden = true;
    column.hidden = false;
  }

  backButton.addEventListener("click", () => {
    leaveBlocked();
    mount();
    focusOpenFolder();
  });
  anotherButton.addEventListener("click", () => {
    leaveBlocked();
    mount();
    inputRoot
      .querySelector<HTMLElement & { click(): void }>(
        '[data-action="open-folder"]',
      )
      ?.click();
  });

  function focusOpenFolder(): void {
    const open = inputRoot.querySelector<HTMLElement>(
      '[data-action="open-folder"]',
    );
    (open?.shadowRoot?.querySelector("button") ?? open)?.focus();
  }

  element.append(chrome, column, blocked, alertRegion);

  function showVersionBlocked(info: UnsupportedVersionInfo): void {
    blockedInfo = info;
    renderBlocked();
    column.hidden = true;
    blocked.hidden = false;
    blockedTitle.focus();
  }

  function mount(): void {
    renderNewCharacterWizard(wizardRoot, {
      ...options.wizard,
      onFailure: (message) => {
        alert(message);
        options.wizard.onFailure?.(message);
      },
    });
    renderCharacterFileInput(inputRoot, {
      ...options.fileInput,
      onUnsupportedVersion: (info) => showVersionBlocked(info),
      onFailure: (message) => {
        alert(message);
        options.fileInput.onFailure?.(message);
      },
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
    renderBlocked();
  }

  renderText();
  mount();
  const stopLocale = onLocaleChange(renderText);

  return {
    element,
    reset() {
      leaveBlocked();
      mount();
    },
    showVersionBlocked,
    focusTitle() {
      title.focus();
    },
    alert,
    destroy() {
      window.clearTimeout(alertTimer);
      stopLocale();
      themeToggle.destroy();
      element.remove();
    },
  };
}
