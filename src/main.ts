import "@openkakutou/web-ui-kit/tokens.css";
import "@openkakutou/web-ui-kit";
import { version as webUiKitVersion } from "@openkakutou/web-ui-kit";
import type { WuikLocaleSwitcherElement } from "@openkakutou/web-ui-kit";
import "./style.css";
import { renderAnimationEditor } from "./animations/animation-editor.ts";
import { renderCommandEditor } from "./commands/command-editor.ts";
import {
  addSpriteEdit,
  getCharacterDocument,
  seedCommandFile,
  setCharacterDocument,
  setCommandFile,
  updateCharacterFields,
} from "./document/character-document.ts";
import { renderCharacteristicsEditor } from "./editors/characteristics-editor.ts";
import { renderStateEditor } from "./editors/state-editor.ts";
import { getAppHistory, isDirty } from "./history/app-history.ts";
import { installUnsavedChangesGuard } from "./history/unsaved-changes-guard.ts";
import { getI18n, initAppI18n, onLocaleChange, t } from "./i18n/i18n.ts";
import { renderCharacterFileInput } from "./input/character-file-input-view.ts";
import type {
  CharacterFileInputOptions,
  LoadedFileBytes,
} from "./input/character-file-input.ts";
import type { PaletteEditorHandle } from "./palettes/palette-editor.ts";
import { renderPaletteEditor } from "./palettes/palette-editor.ts";
import { renderExportPanel } from "./save/export-panel.ts";
import { installGlobalShortcutListener } from "./shortcuts/global-shortcut-listener.ts";
import { renderShortcutsScreen } from "./shortcuts/shortcuts-screen.ts";
import { renderSpriteBrowser } from "./sprites/sprite-browser.ts";
import { appVersion } from "./version.ts";
import type { CharacterData } from "./wasm/types.ts";
import {
  MIN_SUPPORTED_WEB_UI_KIT_VERSION,
  isWebUiKitVersionSupported,
} from "./web-ui-kit-version.ts";
import { renderNewCharacterWizard } from "./wizard/new-character-wizard-view.ts";
import type { CreateCharacterOptions } from "./wizard/new-character-wizard.ts";

// The app's own brand name -- a proper noun, deliberately never translated
// (see .vibe/decisions/015-i18n-integration-approach.md).
const APP_TITLE = "Character Editor";

/**
 * `renderApp` is only ever really invoked once per page (from `mount()`),
 * but tests call it repeatedly on the same or a fresh root -- torn down at
 * the top of every call, before a fresh one is made, so a locale-change
 * subscription from a previous call never accumulates or fires against
 * content no longer on the page. Mirrors `lifebar-editor`'s own equivalent
 * (`.vibe/decisions/015-i18n-integration-approach.md`).
 */
let currentUnsubscribeLocaleChange: (() => void) | undefined;

/** Applies the resolved locale to `<html lang>` so assistive technology
 * picks the right pronunciation -- a small, purely additive correctness fix
 * over the pattern ported from sibling apps (see .vibe/decisions/015). */
function applyDocumentLang(): void {
  const instance = getI18n();
  const resolved = instance?.resolvedLanguage ?? instance?.language;
  if (resolved) {
    document.documentElement.lang = resolved;
  }
}

/**
 * Re-invoked (replacing its own previous content) on a locale change, so
 * its text stays live even in this degraded state -- the browser-detected/
 * persisted locale still applies via `t()`, but no `<wuik-locale-switcher>`
 * is available to switch it manually here since `web-ui-kit`'s own custom
 * elements may not be usable in this exact failure mode.
 */
function renderVersionError(root: HTMLElement, installedVersion: string): void {
  root.replaceChildren();

  const container = document.createElement("div");
  container.className = "web-ui-kit-version-error";
  container.setAttribute("role", "alert");
  container.setAttribute("aria-live", "assertive");

  const heading = document.createElement("h1");
  heading.textContent = t(
    "errors.versionMismatchHeading",
    "This app can't start",
  );

  const message = document.createElement("p");
  message.textContent = t(
    "errors.versionMismatchBody",
    "{{title}} requires @openkakutou/web-ui-kit v{{minVersion}} or newer, but found v{{installedVersion}}. Update the web-ui-kit dependency and reload.",
    {
      title: APP_TITLE,
      minVersion: MIN_SUPPORTED_WEB_UI_KIT_VERSION,
      installedVersion,
    },
  );

  container.append(heading, message);
  root.appendChild(container);
}

/**
 * The Undo/Redo toolbar buttons (backlog item 010), sharing one history
 * across every editor screen via `history/app-history.ts`. Disabled state
 * reflects `canUndo`/`canRedo` but each click handler still calls
 * `history.undo()`/`.redo()` directly rather than trusting the `disabled`
 * attribute alone -- `CommandStack` already treats an empty stack as a safe
 * no-op, and this project's own convention is to never rely solely on a
 * button's `disabled` attribute for a boundary condition (see
 * `state-editor.ts`'s reorder handlers).
 */
function renderUndoRedoButtons(onChange: () => void): {
  undoButton: HTMLElement;
  redoButton: HTMLElement;
  refresh: () => void;
} {
  const undoButton = document.createElement("wuik-button");
  undoButton.setAttribute("variant", "secondary");
  undoButton.dataset.action = "undo";
  undoButton.textContent = t("app.undo", "Undo");
  undoButton.setAttribute(
    "aria-label",
    t("app.undoAriaLabel", "Undo last change"),
  );

  const redoButton = document.createElement("wuik-button");
  redoButton.setAttribute("variant", "secondary");
  redoButton.dataset.action = "redo";
  redoButton.textContent = t("app.redo", "Redo");
  redoButton.setAttribute(
    "aria-label",
    t("app.redoAriaLabel", "Redo last undone change"),
  );

  function refresh(): void {
    const history = getAppHistory();
    if (history.canUndo) {
      undoButton.removeAttribute("disabled");
    } else {
      undoButton.setAttribute("disabled", "");
    }
    if (history.canRedo) {
      redoButton.removeAttribute("disabled");
    } else {
      redoButton.setAttribute("disabled", "");
    }
  }

  undoButton.addEventListener("click", () => {
    if (!getAppHistory().undo()) return;
    onChange();
  });
  redoButton.addEventListener("click", () => {
    if (!getAppHistory().redo()) return;
    onChange();
  });

  refresh();
  return { undoButton, redoButton, refresh };
}

function currentThemeToggleLabel(): string {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return isDark
    ? t("app.themeToggleLight", "Switch to light mode")
    : t("app.themeToggleDark", "Switch to dark mode");
}

function renderThemeToggle(): HTMLElement {
  const toggle = document.createElement("wuik-button");
  toggle.setAttribute("variant", "secondary");
  toggle.dataset.action = "theme-toggle";
  toggle.textContent = currentThemeToggleLabel();

  toggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "light" : "dark",
    );
    toggle.textContent = currentThemeToggleLabel();
  });

  return toggle;
}

export interface RenderAppOptions {
  /**
   * Forwarded to the file input's, export panel's, command editor's, and
   * new-character wizard's own WASM bridge calls; injectable for testing.
   * One shared shape (rather than a separate option per screen) since every
   * one of them ultimately calls into the same `character` WASM module.
   */
  bridgeOptions?: CharacterFileInputOptions & CreateCharacterOptions;
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
  currentUnsubscribeLocaleChange?.();
  currentUnsubscribeLocaleChange = undefined;
  applyDocumentLang();

  if (!isWebUiKitVersionSupported(installedWebUiKitVersion)) {
    renderVersionError(root, installedWebUiKitVersion);
    currentUnsubscribeLocaleChange = onLocaleChange(() => {
      applyDocumentLang();
      renderVersionError(root, installedWebUiKitVersion);
    });
    return;
  }

  const shell = document.createElement("wuik-app-shell");

  const toolbar = document.createElement("wuik-toolbar");
  toolbar.slot = "toolbar";
  toolbar.setAttribute("role", "banner");

  const title = document.createElement("span");
  title.className = "app-title";
  title.textContent = t("app.title", "{{title}} — v{{version}}", {
    title: APP_TITLE,
    version,
  });

  // Always visible (not tucked away in the Export panel further down the
  // page) so the only feedback about unsaved work isn't the browser's own
  // beforeunload prompt on the way out -- see .vibe/decisions/012.
  const unsavedIndicator = document.createElement("span");
  unsavedIndicator.className = "app-unsaved-indicator";
  unsavedIndicator.setAttribute("role", "status");

  const {
    undoButton,
    redoButton,
    refresh: refreshUndoRedoButtons,
  } = renderUndoRedoButtons(onHistoryChange);

  const spacer = document.createElement("div");
  spacer.className = "toolbar-spacer";

  const localeSwitcher = document.createElement(
    "wuik-locale-switcher",
  ) as unknown as WuikLocaleSwitcherElement;
  localeSwitcher.className = "locale-switcher";
  localeSwitcher.setAttribute("label", t("app.languageLabel", "Language"));
  localeSwitcher.i18n = getI18n();

  toolbar.append(
    title,
    unsavedIndicator,
    undoButton,
    redoButton,
    spacer,
    renderThemeToggle(),
    localeSwitcher,
  );
  shell.appendChild(toolbar);

  const main = document.createElement("main");
  const shortcutsScreenContainer = document.createElement("div");
  const characteristicsContainer = document.createElement("div");
  const spriteBrowserContainer = document.createElement("div");
  const paletteEditorContainer = document.createElement("div");
  const stateEditorContainer = document.createElement("div");
  const animationEditorContainer = document.createElement("div");
  const commandEditorContainer = document.createElement("div");
  const exportPanelContainer = document.createElement("div");

  // The palette editor manages its own local state and its own commands on
  // the shared history (see .vibe/decisions/011 and palette-editor.ts's own
  // PaletteEditorHandle doc comment) -- this only needs its returned
  // handle to ask it to reflect a history change from the outside.
  let paletteEditorHandle: PaletteEditorHandle | null = null;

  function refreshHistoryUI(): void {
    refreshUndoRedoButtons();
    unsavedIndicator.textContent = isDirty()
      ? t("app.unsavedChanges", "Unsaved changes")
      : "";
  }

  // Re-renders the animation editor against the document's latest character
  // (so a prior animation-editor commit isn't clobbered by a stale
  // `character` closure) and spriteEdits overlay -- called on load and
  // again on every sprite browser edit and every history change, so a
  // frame's "sprite exists" check (and its live Clsn preview) stays
  // current. animation-editor.ts itself persists expand/Clsn-panel-open
  // state across this repeated call (keyed off `animationEditorContainer`
  // staying the same element), so this doesn't collapse the user's place
  // the way a naive full re-render would.
  function rerenderAnimationEditor(): void {
    const doc = getCharacterDocument();
    if (!doc) return;
    renderAnimationEditor(
      animationEditorContainer,
      doc.character,
      doc.files.sff,
      doc.spriteEdits,
      {
        onChange: (patch) => {
          updateCharacterFields(patch);
          refreshHistoryUI();
        },
      },
    );
  }

  // The document-backed editor screens that can safely be rebuilt from
  // scratch at any time -- everything except the palette editor (manages
  // its own undo/redo and local state independently, see .vibe/decisions/011)
  // and the command editor (see the dedicated comment on `mountCommandEditor`
  // below for why it is deliberately *not* here). Callable both from the
  // initial character load and from an Undo/Redo click, so a history change
  // is reflected the exact same way a fresh load already is.
  function onEditorPatch(patch: Partial<CharacterData>): void {
    updateCharacterFields(patch);
    refreshHistoryUI();
  }

  // Re-renders just the characteristics editor and the state editor from
  // the document's current character -- the two document-backed screens
  // with no locale-sensitive session state a re-render would lose (unlike
  // the sprite browser's pending edit overlay or the animation editor's
  // expand/Clsn state, each retranslating themselves internally instead).
  // Shared by the initial/history-change full render below and by the
  // locale-change subscription further down. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  function retranslateSimpleEditors(): void {
    const doc = getCharacterDocument();
    if (!doc) return;
    renderCharacteristicsEditor(characteristicsContainer, doc.character, {
      onChange: onEditorPatch,
    });
    renderStateEditor(stateEditorContainer, doc.character, {
      onChange: onEditorPatch,
    });
  }

  function renderDocumentBackedEditors(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    renderCharacteristicsEditor(characteristicsContainer, character, {
      onChange: onEditorPatch,
    });
    renderSpriteBrowser(spriteBrowserContainer, character, files.sff, [], {
      onSpriteEdit: (edit) => {
        addSpriteEdit(edit);
        refreshHistoryUI();
        rerenderAnimationEditor();
      },
    });
    renderStateEditor(stateEditorContainer, character, {
      onChange: onEditorPatch,
    });
    rerenderAnimationEditor();
  }

  /**
   * Mounts the command editor exactly once, at the initial character load --
   * never again from an Undo/Redo click, unlike every other document-backed
   * editor. `command-editor.ts`'s own `startReady` unconditionally calls
   * `onChange` once on every mount, to seed the document store with the
   * freshly re-parsed `.cmd` file the moment it's ready (see that function's
   * own doc comment) -- a one-time, load-time normalization that was always
   * harmless when this screen was only ever mounted once per document. Item
   * 010's undo/redo re-render would otherwise re-invoke this on every single
   * Undo/Redo click, re-parsing the *original* `.cmd` bytes from scratch and
   * pushing a spurious extra history entry each time -- silently discarding
   * any command edits and corrupting the redo stack. A command edit is still
   * fully undoable (its own `setCommandFile` push is unaffected); only this
   * screen's own live re-sync after an *external* history change is out of
   * scope until command-editor.ts gains a real way to resume from an
   * existing `CommandFile` instead of always re-parsing raw bytes.
   */
  function mountCommandEditor(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    renderCommandEditor(commandEditorContainer, character, files.cmd ?? null, {
      onChange: (commandFile, isInitialLoad) => {
        if (isInitialLoad) {
          // The one-time mount seed (see this function's own doc comment)
          // is not a user edit -- never recorded as an undo/redo entry.
          seedCommandFile(commandFile);
          return;
        }
        setCommandFile(commandFile);
        refreshHistoryUI();
      },
      bridgeOptions: options.bridgeOptions,
    });
  }

  /**
   * Refreshes every document-backed editor screen from the restored
   * character after an Undo/Redo click -- the same full re-render an
   * editor's own patch already causes via `renderDocumentBackedEditors`,
   * just triggered externally since undo/redo mutate the document store
   * directly (`character-document.ts`'s own command do/undo closures)
   * without going through any editor's DOM at all. The palette editor,
   * command editor, and Export panel are deliberately left alone: the
   * palette editor's own commands already re-render its local state
   * themselves when undone/redone (.vibe/decisions/011), the command editor
   * is never re-mounted after its initial load (see `mountCommandEditor`
   * above), and Export only ever recomputes on its own explicit action
   * (.vibe/decisions/010).
   */
  function onHistoryChange(): void {
    const doc = getCharacterDocument();
    if (doc) renderDocumentBackedEditors(doc.character, doc.files);
    paletteEditorHandle?.refresh();
    refreshHistoryUI();
  }

  // Shared by both ways to arrive at a loaded character -- the file input
  // (an import) and the new-character wizard (created from scratch) -- so
  // a wizard-created character is wired up identically to an imported one,
  // not through a second, parallel code path that could drift from it.
  function handleCharacterLoaded(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    setCharacterDocument({ character, files });
    renderDocumentBackedEditors(character, files);
    mountCommandEditor(character, files);
    paletteEditorHandle = renderPaletteEditor(
      paletteEditorContainer,
      character,
      files.sff,
      { onHistoryPush: refreshHistoryUI },
    );

    // Rendered once here, like every other panel above -- it does not
    // need to be re-rendered on every subsequent edit the way the
    // animation editor is: it recomputes its own file list on demand
    // (an explicit "Refresh export" click reads the document store
    // fresh) rather than living. See
    // .vibe/decisions/010-export-panel-explicit-refresh-not-live-recompute.md.
    renderExportPanel(exportPanelContainer, {
      bridgeOptions: options.bridgeOptions,
      onSaved: refreshHistoryUI,
    });
    refreshHistoryUI();
  }

  renderCharacterFileInput(main, {
    onLoaded: handleCharacterLoaded,
    bridgeOptions: options.bridgeOptions,
  });

  const wizardDivider = document.createElement("p");
  wizardDivider.className = "new-character-wizard__divider";
  wizardDivider.textContent = t("app.wizardDivider", "or");
  const wizardContainer = document.createElement("div");
  renderNewCharacterWizard(wizardContainer, {
    onCreated: handleCharacterLoaded,
    bridgeOptions: options.bridgeOptions,
  });
  main.append(wizardDivider, wizardContainer);

  // Rendered here (after the file input's own `root.replaceChildren()` call
  // above, which would otherwise wipe out anything appended to `main`
  // before it runs) and unconditionally -- unlike every other screen below,
  // its actions (Undo/Redo/Save chief among them) are relevant before a
  // character is even loaded, so it is not gated behind
  // `handleCharacterLoaded` the way they are. See .vibe/decisions/014.
  renderShortcutsScreen(shortcutsScreenContainer);

  main.append(
    shortcutsScreenContainer,
    characteristicsContainer,
    spriteBrowserContainer,
    paletteEditorContainer,
    stateEditorContainer,
    commandEditorContainer,
    animationEditorContainer,
    exportPanelContainer,
  );
  shell.appendChild(main);

  root.appendChild(shell);

  // Live locale switching (backlog item 012): re-translates every piece of
  // "chrome" main.ts owns directly -- the title, the switcher's own label,
  // the Undo/Redo buttons' text and aria-label, the theme toggle's current
  // label, the unsaved-changes indicator, the wizard divider -- and
  // re-invokes the characteristics/state editors' own existing render
  // calls (no locale-sensitive state of their own to lose) plus the
  // animation editor's own existing `rerenderAnimationEditor` (its
  // expand/Clsn-panel-open state survives this exact call already, keyed
  // off `animationEditorContainer` staying the same element -- see that
  // function's own doc comment). Every other screen with session-important
  // state (the file input, the wizard, the sprite browser, the
  // palette/command editors, the export panel, the shortcuts screen)
  // retranslates itself, from its own internal `onLocaleChange`
  // subscription, without main.ts's help. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  currentUnsubscribeLocaleChange = onLocaleChange(() => {
    applyDocumentLang();
    title.textContent = t("app.title", "{{title}} — v{{version}}", {
      title: APP_TITLE,
      version,
    });
    localeSwitcher.setAttribute("label", t("app.languageLabel", "Language"));
    undoButton.textContent = t("app.undo", "Undo");
    undoButton.setAttribute(
      "aria-label",
      t("app.undoAriaLabel", "Undo last change"),
    );
    redoButton.textContent = t("app.redo", "Redo");
    redoButton.setAttribute(
      "aria-label",
      t("app.redoAriaLabel", "Redo last undone change"),
    );
    const themeToggle = toolbar.querySelector<HTMLElement>(
      '[data-action="theme-toggle"]',
    );
    if (themeToggle) themeToggle.textContent = currentThemeToggleLabel();
    wizardDivider.textContent = t("app.wizardDivider", "or");
    refreshHistoryUI();
    retranslateSimpleEditors();
    rerenderAnimationEditor();
  });
}

/**
 * `initAppI18n` is awaited here, before the very first `renderApp` call --
 * never inside `renderApp` itself, which stays synchronous so tests can
 * keep calling it directly with deterministic English defaults (see
 * .vibe/decisions/015-i18n-integration-approach.md). This is also why the
 * real app never flashes English before a persisted locale resolves: the
 * first paint already has the right language.
 */
async function mount(): Promise<void> {
  await initAppI18n();
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app) {
    renderApp(app, appVersion, webUiKitVersion);
  }

  // Registered once here (bootstrap), not inside `renderApp` -- that
  // function runs on every re-render in tests, which would otherwise stack
  // up a fresh `beforeunload` listener on `window` each time. See
  // .vibe/decisions/012.
  installUnsavedChangesGuard();

  // Same "install once at bootstrap" reasoning as the guard above --
  // otherwise every `renderApp` call in tests would stack up another
  // `keydown` listener on `window`. See .vibe/decisions/014.
  installGlobalShortcutListener();
}

if (document.readyState === "complete") {
  void mount();
} else {
  window.addEventListener("load", () => void mount(), { once: true });
}
