import { onLocaleChange, t } from "../i18n/i18n.ts";

const THEME_EVENT = "character-editor-theme";

/** Dark is the kit's default: only an explicit `light` makes it light. */
export function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

/**
 * A button that switches between dark and light. Every toggle on the page
 * refreshes its label when any of them (or the locale) changes.
 */
export function createThemeToggle(): { element: HTMLElement; destroy(): void } {
  const element = document.createElement("wuik-button");
  element.setAttribute("variant", "secondary");
  element.dataset.action = "theme-toggle";

  function refresh(): void {
    element.textContent = isDarkTheme()
      ? t("app.themeToggleLight", "Switch to light mode")
      : t("app.themeToggleDark", "Switch to dark mode");
  }

  element.addEventListener("click", () => {
    document.documentElement.setAttribute(
      "data-theme",
      isDarkTheme() ? "light" : "dark",
    );
    document.dispatchEvent(new Event(THEME_EVENT));
  });
  document.addEventListener(THEME_EVENT, refresh);
  const stopLocale = onLocaleChange(refresh);
  refresh();

  return {
    element,
    destroy() {
      document.removeEventListener(THEME_EVENT, refresh);
      stopLocale();
    },
  };
}
