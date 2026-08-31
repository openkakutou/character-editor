import "@openkakutou/web-ui-kit/tokens.css";
import "@openkakutou/web-ui-kit";
import { version as webUiKitVersion } from "@openkakutou/web-ui-kit";
import "./style.css";
import { renderAnimationEditor } from "./animations/animation-editor.ts";
import {
  addSpriteEdit,
  getCharacterDocument,
  setCharacterDocument,
  updateCharacterFields,
} from "./document/character-document.ts";
import { renderCharacteristicsEditor } from "./editors/characteristics-editor.ts";
import { renderStateEditor } from "./editors/state-editor.ts";
import { renderCharacterFileInput } from "./input/character-file-input-view.ts";
import type { CharacterFileInputOptions } from "./input/character-file-input.ts";
import { renderPaletteEditor } from "./palettes/palette-editor.ts";
import { renderSpriteBrowser } from "./sprites/sprite-browser.ts";
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

export interface RenderAppOptions {
  /** Forwarded to the file input's WASM bridge; injectable for testing. */
  bridgeOptions?: CharacterFileInputOptions;
}

/**
 * Builds the app's root frame — a `web-ui-kit` `<wuik-app-shell>` with the
 * app title (plus version) and a light/dark theme toggle in the toolbar,
 * plus the character file input (backlog item 002) as the main content.
 * Once the 4 required files load successfully, the parsed character and
 * every supplied file's raw bytes are stored in the in-memory
 * `CharacterDocument` (src/document/character-document.ts), and the
 * characteristics editor (backlog item 003) appears — inline, not behind a
 * tab, following the same "one screen until a second one exists" precedent
 * `character-viewer-web` set — reflecting every edit into that same
 * document immediately. Later editor items (004-008) read from and
 * eventually write back to the same document. If the
 * installed `web-ui-kit` version is too old to expose the shell/tokens this
 * relies on, renders a clear, screen-reader-announced error instead — see
 * .vibe/decisions/001-web-ui-kit-adoption-scope.md.
 */
export function renderApp(
  root: HTMLElement,
  version: string,
  installedWebUiKitVersion: string,
  options: RenderAppOptions = {},
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

  const main = document.createElement("main");
  const characteristicsContainer = document.createElement("div");
  const spriteBrowserContainer = document.createElement("div");
  const paletteEditorContainer = document.createElement("div");
  const stateEditorContainer = document.createElement("div");
  const animationEditorContainer = document.createElement("div");
  renderCharacterFileInput(main, {
    onLoaded: (character, files) => {
      setCharacterDocument({ character, files });

      // Re-renders the animation editor against the document's latest
      // character (so a prior animation-editor commit isn't clobbered by
      // this closure's now-stale `character` parameter) and spriteEdits
      // overlay — called on load and again on every sprite browser edit,
      // so a frame's "sprite exists" check (and its live Clsn preview)
      // reflects a sprite added/replaced/deleted in this same session, not
      // just the WASM-parsed metadata. animation-editor.ts itself persists
      // expand/Clsn-panel-open state across this repeated call (keyed off
      // `animationEditorContainer` staying the same element), so this
      // doesn't collapse the user's place the way a naive full re-render
      // would.
      function rerenderAnimationEditor(): void {
        const doc = getCharacterDocument();
        if (!doc) return;
        renderAnimationEditor(
          animationEditorContainer,
          doc.character,
          files.sff,
          doc.spriteEdits,
          { onChange: (patch) => updateCharacterFields(patch) },
        );
      }

      renderCharacteristicsEditor(characteristicsContainer, character, {
        onChange: (patch) => updateCharacterFields(patch),
      });
      renderSpriteBrowser(spriteBrowserContainer, character, files.sff, [], {
        onSpriteEdit: (edit) => {
          addSpriteEdit(edit);
          rerenderAnimationEditor();
        },
      });
      renderPaletteEditor(paletteEditorContainer, character, files.sff);
      renderStateEditor(stateEditorContainer, character, {
        onChange: (patch) => updateCharacterFields(patch),
      });
      rerenderAnimationEditor();
    },
    bridgeOptions: options.bridgeOptions,
  });
  main.append(
    characteristicsContainer,
    spriteBrowserContainer,
    paletteEditorContainer,
    stateEditorContainer,
    animationEditorContainer,
  );
  shell.appendChild(main);

  root.appendChild(shell);
}

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  renderApp(app, appVersion, webUiKitVersion);
}
