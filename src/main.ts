import "@openkakutou/web-ui-kit/tokens.css";
import "@openkakutou/web-ui-kit";
import { version as webUiKitVersion } from "@openkakutou/web-ui-kit";
import "./style.css";
import { appVersion } from "./version.ts";
import {
  MIN_SUPPORTED_WEB_UI_KIT_VERSION,
  isWebUiKitVersionSupported,
} from "./web-ui-kit-version.ts";

const APP_TITLE = "Character Editor";

function renderVersionError(root: HTMLElement, installedVersion: string): void {
  const container = document.createElement("div");
  container.className = "web-ui-kit-version-error";
  container.setAttribute("role", "alert");
  container.setAttribute("aria-live", "assertive");

  const heading = document.createElement("h1");
  heading.textContent = "This app can't start";

  const message = document.createElement("p");
  message.textContent = `${APP_TITLE} requires @openkakutou/web-ui-kit v${MIN_SUPPORTED_WEB_UI_KIT_VERSION} or newer, but found v${installedVersion}. Update the web-ui-kit dependency and reload.`;

  container.append(heading, message);
  root.appendChild(container);
}

function renderThemeToggle(): HTMLElement {
  const toggle = document.createElement("wuik-button");
  toggle.setAttribute("variant", "secondary");
  toggle.textContent = "Switch to dark mode";

  toggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "light" : "dark",
    );
    toggle.textContent = isDark
      ? "Switch to dark mode"
      : "Switch to light mode";
  });

  return toggle;
}

/**
 * Builds the app's root frame — a `web-ui-kit` `<wuik-app-shell>` with the
 * app title (plus version) and a light/dark theme toggle in the toolbar.
 * If the installed `web-ui-kit` version is too old to expose the shell/
 * tokens this relies on, renders a clear, screen-reader-announced error
 * instead — see .vibe/decisions/001-web-ui-kit-adoption-scope.md.
 */
export function renderApp(
  root: HTMLElement,
  version: string,
  installedWebUiKitVersion: string,
): void {
  root.replaceChildren();

  if (!isWebUiKitVersionSupported(installedWebUiKitVersion)) {
    renderVersionError(root, installedWebUiKitVersion);
    return;
  }

  const shell = document.createElement("wuik-app-shell");

  const toolbar = document.createElement("wuik-toolbar");
  toolbar.slot = "toolbar";
  toolbar.setAttribute("role", "banner");

  const title = document.createElement("span");
  title.className = "app-title";
  title.textContent = `${APP_TITLE} — v${version}`;

  const spacer = document.createElement("div");
  spacer.className = "toolbar-spacer";

  toolbar.append(title, spacer, renderThemeToggle());
  shell.appendChild(toolbar);

  root.appendChild(shell);
}

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  renderApp(app, appVersion, webUiKitVersion);
}
