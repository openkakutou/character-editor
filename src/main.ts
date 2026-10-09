import "@openkakutou/web-ui-kit/tokens.css";
import "@openkakutou/web-ui-kit";
import { version as webUiKitVersion } from "@openkakutou/web-ui-kit";
import "./style.css";
import "./shell/shell.css";
import "./problems/problems.css";
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
import type { HistoryMeta } from "./history/app-history.ts";
import { installUnsavedChangesGuard } from "./history/unsaved-changes-guard.ts";
import { getI18n, initAppI18n, onLocaleChange, t } from "./i18n/i18n.ts";
import { tCount } from "./i18n/plural.ts";
import type {
  CharacterFileInputOptions,
  LoadedFileBytes,
} from "./input/character-file-input.ts";
import type { PaletteEditorHandle } from "./palettes/palette-editor.ts";
import {
  defaultTriggerDownload,
  renderPaletteEditor,
} from "./palettes/palette-editor.ts";
import { createExportController } from "./save/export-controller.ts";
import { createAppShell } from "./shell/app-shell.ts";
import { createHelpDialog } from "./shell/help-dialog.ts";
import { createHomeView } from "./shell/home-view.ts";
import { createLeaveDialog } from "./shell/leave-dialog.ts";
import { renderOutputSection } from "./shell/output-section.ts";
import type { SectionId } from "./shell/sections.ts";
import { installShellShortcuts } from "./shell/shell-shortcuts.ts";
import { installGlobalShortcutListener } from "./shortcuts/global-shortcut-listener.ts";
import { renderSoundBrowser } from "./sounds/sound-browser.ts";
import { renderSpriteBrowser } from "./sprites/sprite-browser.ts";
import { validateCharacterDocument } from "./validation/character-validation.ts";
import type { ValidationIssue } from "./validation/character-validation.ts";
import { getValidationStore } from "./validation/validation-store.ts";
import { appVersion } from "./version.ts";
import type { CharacterData } from "./wasm/types.ts";
import {
  MIN_SUPPORTED_WEB_UI_KIT_VERSION,
  isWebUiKitVersionSupported,
} from "./web-ui-kit-version.ts";
import type { CreateCharacterOptions } from "./wizard/new-character-wizard.ts";

// The app's own brand name -- a proper noun, deliberately never translated
// (see .vibe/decisions/015-i18n-integration-approach.md).
const APP_TITLE = "Character Editor";

const DOCUMENT_SOURCE = "document";
const ANNOUNCE_DEBOUNCE_MS = 600;
const ACTION_ANNOUNCEMENT_GRACE_MS = 1500;

/**
 * `renderApp` is only ever really invoked once per page (from `mount()`),
 * but tests call it repeatedly on the same or a fresh root -- torn down at
 * the top of every call, before a fresh one is made, so subscriptions from a
 * previous call never accumulate or fire against content no longer on the
 * page. Mirrors `lifebar-editor`'s own equivalent
 * (`.vibe/decisions/015-i18n-integration-approach.md`).
 */
let teardownPreviousRender: (() => void) | undefined;

/** Applies the resolved locale to `<html lang>` so assistive technology picks the right pronunciation. */
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

export interface RenderAppOptions {
  /**
   * Forwarded to the file input's, export's, command editor's, and
   * new-character wizard's own WASM bridge calls; injectable for testing.
   * One shared shape (rather than a separate option per screen) since every
   * one of them ultimately calls into the same `character` WASM module.
   */
  bridgeOptions?: CharacterFileInputOptions & CreateCharacterOptions;
  /** Triggers a browser download of an exported file; injectable for testing. */
  triggerDownload?: (bytes: Uint8Array, fileName: string) => void;
}

/** Whether a modal dialog is open, anywhere in the page. */
function isModalDialogOpen(): boolean {
  return document.querySelector("wuik-dialog[open]") !== null;
}

/**
 * Builds the app: the home screen (folder drop zone, New character) shown
 * until a character is open, then the shell -- toolbar, sectioned sidebar and
 * one editor section at a time -- see `.ux/flows/001-application-shell.md`.
 * The parsed character and every supplied file's raw bytes are stored in the
 * in-memory `CharacterDocument` (src/document/character-document.ts); every
 * section stays mounted so selection, zoom and unsaved drafts survive
 * navigation. If the installed `web-ui-kit` version is too old to expose what
 * this relies on, renders a clear, screen-reader-announced error instead --
 * see .vibe/decisions/001-web-ui-kit-adoption-scope.md.
 */
export function renderApp(
  root: HTMLElement,
  version: string,
  installedWebUiKitVersion: string,
  options: RenderAppOptions = {},
): void {
  teardownPreviousRender?.();
  teardownPreviousRender = undefined;
  root.replaceChildren();
  applyDocumentLang();

  if (!isWebUiKitVersionSupported(installedWebUiKitVersion)) {
    renderVersionError(root, installedWebUiKitVersion);
    const stop = onLocaleChange(() => {
      applyDocumentLang();
      renderVersionError(root, installedWebUiKitVersion);
    });
    teardownPreviousRender = stop;
    return;
  }

  const validation = getValidationStore();
  validation.reset();
  const cleanups: Array<() => void> = [];

  const exportController = createExportController({
    getDocument: getCharacterDocument,
    validation,
    triggerDownload: options.triggerDownload ?? defaultTriggerDownload,
    exportOptions: { bridgeOptions: options.bridgeOptions },
    onSaved: () => refreshChrome(),
  });
  const helpDialog = createHelpDialog();
  const leaveDialog = createLeaveDialog(exportController);

  // The palette editor manages its own local state and its own commands on
  // the shared history (see .vibe/decisions/011 and palette-editor.ts's own
  // PaletteEditorHandle doc comment) -- this only needs its returned
  // handle to ask it to reflect a history change from the outside.
  let paletteEditorHandle: PaletteEditorHandle | null = null;

  const shell = createAppShell({
    version,
    onUndo: () => stepHistory("undo"),
    onRedo: () => stepHistory("redo"),
    onExport: requestExport,
    onHelp: () => helpDialog.open(),
    onOpenAnother: () => void openAnotherCharacter(),
    onNavigate: (id) => {
      if (id === "output") void exportController.preview();
    },
  });
  shell.element.hidden = true;

  const home = createHomeView({
    fileInput: {
      onLoaded: handleCharacterLoaded,
      bridgeOptions: options.bridgeOptions,
      isActive: () => shell.element.hidden,
    },
    wizard: {
      onCreated: handleCharacterLoaded,
      bridgeOptions: options.bridgeOptions,
    },
  });

  root.append(
    home.element,
    shell.element,
    helpDialog.element,
    leaveDialog.element,
  );
  cleanups.push(
    () => home.destroy(),
    () => shell.destroy(),
    () => helpDialog.destroy(),
    () => leaveDialog.destroy(),
  );

  // -- Status, badges and announcements -----------------------------------

  let announceTimer: number | undefined;
  let lastAnnouncedTotals = "";
  // An action announcement ("Undone: …", export done) is the more useful
  // message: the problem totals that follow within this window are skipped.
  let lastActionAnnouncementAt = 0;

  function announceAction(message: string): void {
    lastActionAnnouncementAt = Date.now();
    shell.announce(message);
  }

  function announceValidationTotals(): void {
    const { errors, warnings } = validation.totals();
    const summary = `${errors}/${warnings}`;
    if (summary === lastAnnouncedTotals) return;
    lastAnnouncedTotals = summary;
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      if (
        Date.now() - lastActionAnnouncementAt <
        ACTION_ANNOUNCEMENT_GRACE_MS
      ) {
        return;
      }
      if (errors === 0 && warnings === 0) {
        shell.announce(t("validation.allClear", "No problem found."));
        return;
      }
      shell.announce(
        [
          tCount("nav.badge.errors", errors, {
            one: "{{count}} error",
            other: "{{count}} errors",
          }),
          tCount("nav.badge.warnings", warnings, {
            one: "{{count}} warning",
            other: "{{count}} warnings",
          }),
        ].join(", "),
      );
    }, ANNOUNCE_DEBOUNCE_MS);
  }
  cleanups.push(() => window.clearTimeout(announceTimer));

  cleanups.push(
    validation.subscribe(() => {
      shell.setBadges((id) =>
        validation.hasRun ? validation.countsFor(id) : null,
      );
      announceValidationTotals();
    }),
  );

  cleanups.push(
    exportController.subscribe(() => {
      const state = exportController.state;
      shell.setExportState(state);
      if (state.phase === "error") shell.alert(state.message);
      if (state.phase === "saved") {
        announceAction(
          t("export.savedAnnounce", "Export complete. All files downloaded."),
        );
      }
    }),
  );

  /** Re-runs the validation rules against the live document. */
  function revalidate(): void {
    const doc = getCharacterDocument();
    validation.setIssues(
      DOCUMENT_SOURCE,
      doc === null ? [] : validateCharacterDocument(doc),
    );
  }

  /** Brings every piece of chrome that depends on history and document in line. */
  function refreshChrome(): void {
    const history = getAppHistory();
    shell.setUndoRedoEnabled(history.canUndo, history.canRedo);
    shell.setModified(isDirty());
    revalidate();
  }

  // -- Navigation -----------------------------------------------------------

  function goTo(id: SectionId, focus = true): void {
    shell.goTo(id, { focus });
    if (id === "output") void exportController.preview();
  }

  /** Moves to the element an issue is about, falling back to the section title. */
  function goToIssue(issue: ValidationIssue): void {
    goTo(issue.section, false);
    const container = shell.content[issue.section];
    const matches = issue.target
      ? container.querySelectorAll<HTMLElement>(issue.target.selector)
      : [];
    const target = matches[issue.target?.index ?? 0];
    if (target) {
      target.scrollIntoView?.({ block: "center" });
      const focusable =
        target.matches("input, button, select, textarea, [tabindex]") ||
        target.shadowRoot
          ? target
          : target.querySelector<HTMLElement>(
              "input, button, select, textarea, [tabindex]",
            );
      (focusable ?? target).focus?.();
      if ((focusable ?? target) !== document.activeElement) {
        shell.goTo(issue.section, { focus: true });
      }
    } else {
      shell.goTo(issue.section, { focus: true });
    }
  }

  // -- Export, history, leaving ---------------------------------------------

  function requestExport(): void {
    if (validation.totals().errors > 0) {
      goTo("output");
      announceAction(
        t(
          "export.blockedByErrors",
          "Fix the problems listed here before exporting.",
        ),
      );
      return;
    }
    void exportController.run();
  }

  function stepHistory(direction: "undo" | "redo"): void {
    const history = getAppHistory();
    const meta: HistoryMeta | undefined =
      direction === "undo" ? history.undoMeta : history.redoMeta;
    const done = direction === "undo" ? history.undo() : history.redo();
    if (!done) return;
    onHistoryChange();
    const action = meta?.label ?? "";
    announceAction(
      direction === "undo"
        ? t("undo.announce", "Undone: {{action}}", { action })
        : t("undo.redone", "Redone: {{action}}", { action }),
    );
    if (meta !== undefined && meta.section !== shell.current) {
      goTo(meta.section);
    } else if (shell.current === "output") {
      void exportController.preview();
    }
  }

  async function openAnotherCharacter(): Promise<void> {
    // Leaving mid-export would discard the files still being downloaded.
    if (exportController.state.phase === "running") return;
    if (isDirty() && !(await leaveDialog.confirm())) return;
    goHome();
  }

  function goHome(): void {
    setCharacterDocument(null);
    exportController.reset();
    validation.reset();
    paletteEditorHandle = null;
    for (const container of Object.values(shell.content)) {
      container.replaceChildren();
    }
    shell.element.hidden = true;
    shell.setModified(false);
    shell.setUndoRedoEnabled(false, false);
    home.reset();
    home.element.hidden = false;
    home.focusTitle();
  }

  // -- Editors ---------------------------------------------------------------

  function patchHandler(
    section: SectionId,
    key: string,
    fallback: string,
  ): (patch: Partial<CharacterData>) => void {
    return (patch) => {
      updateCharacterFields(patch, { section, label: t(key, fallback) });
      refreshChrome();
    };
  }

  const onIdentityPatch = patchHandler(
    "identity",
    "history.identity",
    "identity change",
  );
  const onStatesPatch = patchHandler(
    "states",
    "history.states",
    "state change",
  );
  const onAnimationsPatch = patchHandler(
    "animations",
    "history.animations",
    "animation change",
  );

  // Re-renders the animation editor against the document's latest character
  // (so a prior animation-editor commit isn't clobbered by a stale
  // `character` closure) and spriteEdits overlay -- called on load and
  // again on every sprite browser edit and every history change, so a
  // frame's "sprite exists" check (and its live Clsn preview) stays
  // current. animation-editor.ts itself persists expand/Clsn-panel-open
  // state across this repeated call (keyed off the container staying the
  // same element), so this doesn't collapse the user's place the way a
  // naive full re-render would.
  function rerenderAnimationEditor(): void {
    const doc = getCharacterDocument();
    if (!doc) return;
    renderAnimationEditor(
      shell.content.animations,
      doc.character,
      doc.files.sff,
      doc.spriteEdits,
      { onChange: onAnimationsPatch },
    );
  }

  // Re-renders just the characteristics editor and the state editor from
  // the document's current character -- the two document-backed screens
  // with no locale-sensitive session state a re-render would lose (unlike
  // the sprite browser's pending edit overlay or the animation editor's
  // expand/Clsn state, each retranslating themselves internally instead).
  // See .vibe/decisions/015-i18n-integration-approach.md.
  function retranslateSimpleEditors(): void {
    const doc = getCharacterDocument();
    if (!doc) return;
    renderCharacteristicsEditor(shell.content.identity, doc.character, {
      onChange: onIdentityPatch,
    });
    renderStateEditor(shell.content.states, doc.character, {
      onChange: onStatesPatch,
    });
  }

  function renderDocumentBackedEditors(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    renderCharacteristicsEditor(shell.content.identity, character, {
      onChange: onIdentityPatch,
    });
    renderSpriteBrowser(shell.content.sprites, character, files.sff, [], {
      onSpriteEdit: (edit) => {
        addSpriteEdit(edit);
        refreshChrome();
        rerenderAnimationEditor();
      },
    });
    renderStateEditor(shell.content.states, character, {
      onChange: onStatesPatch,
    });
    rerenderAnimationEditor();
  }

  /**
   * Mounts the command editor exactly once, at the initial character load --
   * never again from an Undo/Redo click, unlike every other document-backed
   * editor. `command-editor.ts`'s own `startReady` unconditionally calls
   * `onChange` once on every mount, to seed the document store with the
   * freshly re-parsed `.cmd` file the moment it's ready -- a one-time,
   * load-time normalization. Re-invoking it on every Undo/Redo click would
   * re-parse the *original* `.cmd` bytes from scratch and push a spurious
   * extra history entry each time, silently discarding any command edits and
   * corrupting the redo stack. A command edit is still fully undoable (its
   * own `setCommandFile` push is unaffected); only this screen's own live
   * re-sync after an *external* history change is out of scope until
   * command-editor.ts gains a real way to resume from an existing
   * `CommandFile` instead of always re-parsing raw bytes.
   */
  function mountCommandEditor(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    renderCommandEditor(shell.content.commands, character, files.cmd ?? null, {
      onChange: (commandFile, isInitialLoad) => {
        if (isInitialLoad) {
          // The one-time mount seed is not a user edit -- never recorded as
          // an undo/redo entry.
          seedCommandFile(commandFile);
          revalidate();
          return;
        }
        setCommandFile(commandFile);
        refreshChrome();
      },
      bridgeOptions: options.bridgeOptions,
    });
  }

  /**
   * Refreshes every document-backed editor screen from the restored
   * character after an Undo/Redo click -- undo/redo mutate the document store
   * directly without going through any editor's DOM at all. The palette
   * editor refreshes itself through its handle, the command editor is never
   * re-mounted after its initial load (see `mountCommandEditor`), and the
   * Export section recomputes on its own.
   */
  function onHistoryChange(): void {
    const doc = getCharacterDocument();
    if (doc) renderDocumentBackedEditors(doc.character, doc.files);
    paletteEditorHandle?.refresh();
    refreshChrome();
  }

  // Shared by both ways to arrive at a loaded character -- the file input
  // (an import) and the new-character wizard (created from scratch) -- so
  // a wizard-created character is wired up identically to an imported one.
  function handleCharacterLoaded(
    character: CharacterData,
    files: LoadedFileBytes,
  ): void {
    setCharacterDocument({ character, files });
    exportController.reset();
    validation.reset();
    renderDocumentBackedEditors(character, files);
    mountCommandEditor(character, files);
    // Read-only and independent of edit history, so rendered once here
    // like the palette editor, never re-rendered on Undo/Redo.
    renderSoundBrowser(shell.content.sounds, character, files);
    paletteEditorHandle = renderPaletteEditor(
      shell.content.palettes,
      character,
      files.sff,
      { onHistoryPush: refreshChrome },
    );
    refreshChrome();
    home.element.hidden = true;
    shell.element.hidden = false;
    goTo("identity");
  }

  cleanups.push(
    renderOutputSection(shell.content.output, {
      validation,
      controller: exportController,
      onGoToIssue: goToIssue,
    }),
  );

  // Live locale switching (backlog item 012): the shell, home, dialogs and
  // output section retranslate themselves; this re-invokes the
  // characteristics/state editors' own existing render calls (no
  // locale-sensitive state of their own to lose) plus the animation editor's
  // own `rerenderAnimationEditor`, and recomputes the problem messages. Every
  // other screen with session-important state (the sprite browser, the
  // palette/command editors, the sound browser) retranslates itself.
  cleanups.push(
    onLocaleChange(() => {
      applyDocumentLang();
      retranslateSimpleEditors();
      rerenderAnimationEditor();
      if (getCharacterDocument()) refreshChrome();
    }),
  );

  teardownPreviousRender = () => {
    for (const cleanup of cleanups) cleanup();
    shellShortcutsRemoval?.();
    shellShortcutsRemoval = undefined;
  };

  // Alt+1…8 and `?`: re-installed with every render so they always act on
  // the current shell (tests render more than once per page).
  shellShortcutsRemoval?.();
  shellShortcutsRemoval = installShellShortcuts({
    isShellVisible: () => !shell.element.hidden,
    isModalOpen: () => isModalDialogOpen() || shell.drawerOpen,
    goTo: (id) => goTo(id),
    openHelp: () => helpDialog.open(),
  });
}

let shellShortcutsRemoval: (() => void) | undefined;

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
