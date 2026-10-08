// The application shell (UX flow 001, screen app-shell): toolbar, sectioned
// sidebar, one visible section at a time inside the workspace, status bar and
// the below-1024px drawer. Pure view: it owns layout, focus and ARIA, and
// reports what the user asked for through callbacks; the document, history,
// validation and export logic stay with the caller.
import type { WuikLocaleSwitcherElement } from "@openkakutou/web-ui-kit";
import { getI18n, onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import type { ExportState } from "../save/export-controller.ts";
import type { SectionCounts } from "../validation/validation-store.ts";
import { createSectionIcon } from "./section-icons.ts";
import {
  groupLabel,
  sectionDescription,
  sectionHelp,
  sectionHelpLabel,
  sectionTitle,
} from "./section-text.ts";
import {
  SECTION_GROUPS,
  SECTION_IDS,
  type SectionId,
  sectionNumber,
} from "./sections.ts";

const APP_TITLE = "Character Editor";
const FOLD_STORAGE_KEY = "character-editor-sidebar-collapsed";
const NARROW_QUERY = "(max-width: 1023px)";

export interface AppShellOptions {
  version: string;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onHelp: () => void;
  onOpenAnother: () => void;
  /** Called after the user chose a section (click or drawer), before focus moves to its heading. */
  onNavigate?: (id: SectionId) => void;
}

export interface AppShell {
  readonly element: HTMLElement;
  /** Where each section's editor mounts, inside its header card's panel. */
  readonly content: Record<SectionId, HTMLElement>;
  readonly undoButton: HTMLElement;
  readonly redoButton: HTMLElement;
  readonly exportButton: HTMLElement;
  readonly current: SectionId;
  goTo(id: SectionId, options?: { focus?: boolean }): void;
  /** Shows the badge of each section, or none when `countsFor` returns `null`. */
  setBadges(countsFor: (id: SectionId) => SectionCounts | null): void;
  setUndoRedoEnabled(canUndo: boolean, canRedo: boolean): void;
  setModified(modified: boolean): void;
  setExportState(state: ExportState): void;
  /** Polite announcement for assistive technology. */
  announce(message: string): void;
  /** Assertive announcement for a failure. */
  alert(message: string): void;
  openDrawer(): void;
  closeDrawer(options?: { restoreFocus?: boolean }): void;
  destroy(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function readFoldPreference(): boolean {
  try {
    return window.localStorage.getItem(FOLD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFoldPreference(collapsed: boolean): void {
  try {
    window.localStorage.setItem(FOLD_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage blocked: the fold simply is not remembered.
  }
}

function formatTime(date: Date): string {
  const language = getI18n()?.resolvedLanguage ?? getI18n()?.language;
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function badgeLabel(counts: SectionCounts): string {
  const parts: string[] = [];
  if (counts.errors > 0) {
    parts.push(
      tCount("nav.badge.errors", counts.errors, {
        one: "{{count}} error",
        other: "{{count}} errors",
      }),
    );
  }
  if (counts.warnings > 0) {
    parts.push(
      tCount("nav.badge.warnings", counts.warnings, {
        one: "{{count}} warning",
        other: "{{count}} warnings",
      }),
    );
  }
  return parts.join(", ");
}

function button(
  action: string,
  variant: "primary" | "secondary" | "ghost",
): HTMLElement {
  const el = document.createElement("wuik-button");
  el.setAttribute("variant", variant);
  el.dataset.action = action;
  return el;
}

function currentThemeIsDark(): boolean {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

export function createAppShell(options: AppShellOptions): AppShell {
  const root = element("div", "shell");
  const narrowQuery = window.matchMedia?.(NARROW_QUERY);

  const skipLink = element("a", "shell__skip");
  skipLink.href = "#main";

  // -- Toolbar -------------------------------------------------------------
  const toolbarHost = element("header", "shell__toolbar");
  const toolbar = document.createElement("wuik-toolbar");
  const menuButton = button("menu", "ghost");
  menuButton.classList.add("shell__menu");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-controls", "shell-sidebar");
  const title = element("span", "app-title");
  const openAnotherButton = button("open-another", "ghost");
  const undoButton = button("undo", "secondary");
  const redoButton = button("redo", "secondary");
  const modifiedIndicator = element("span", "app-unsaved-indicator");
  const spacer = element("div", "toolbar-spacer");
  const helpButton = button("help", "ghost");
  const themeToggle = button("theme-toggle", "secondary");
  const localeSwitcher = document.createElement(
    "wuik-locale-switcher",
  ) as unknown as WuikLocaleSwitcherElement;
  localeSwitcher.className = "locale-switcher";
  localeSwitcher.i18n = getI18n();
  const exportButton = button("download-all", "primary");
  exportButton.classList.add("shell__export");
  toolbar.append(
    menuButton,
    title,
    openAnotherButton,
    undoButton,
    redoButton,
    modifiedIndicator,
    spacer,
    helpButton,
    localeSwitcher,
    themeToggle,
    exportButton,
  );
  toolbarHost.appendChild(toolbar);

  // -- Sidebar -------------------------------------------------------------
  const sidebar = element("aside", "shell__sidebar");
  sidebar.id = "shell-sidebar";
  const nav = document.createElement("wuik-sidebar-nav") as HTMLElement & {
    current: string | null;
  };
  const navItems = new Map<SectionId, HTMLElement>();
  const navGroups: Array<{
    id: (typeof SECTION_GROUPS)[number]["id"];
    el: HTMLElement;
  }> = [];
  for (const group of SECTION_GROUPS) {
    const groupEl = document.createElement("wuik-nav-group");
    navGroups.push({ id: group.id, el: groupEl });
    for (const id of group.sections) {
      const item = document.createElement("wuik-nav-item");
      item.setAttribute("value", id);
      item.setAttribute("shortcut", String(sectionNumber(id)));
      item.append(createSectionIcon(id), document.createTextNode(""));
      navItems.set(id, item);
      groupEl.appendChild(item);
    }
    nav.appendChild(groupEl);
  }
  const foldButton = button("fold-sidebar", "ghost");
  foldButton.classList.add("shell__fold");
  sidebar.append(nav, foldButton);
  const backdrop = element("div", "shell__backdrop");
  backdrop.hidden = true;

  // -- Workspace -----------------------------------------------------------
  const main = element("main", "shell__main");
  main.id = "main";
  const narrowNotice = element("p", "shell__notice");
  main.appendChild(narrowNotice);
  const panels = new Map<SectionId, HTMLElement>();
  const headers = new Map<SectionId, HTMLElement & { focusHeading(): void }>();
  const content = {} as Record<SectionId, HTMLElement>;
  for (const id of SECTION_IDS) {
    const panel = element("section", "shell__section");
    panel.dataset.section = id;
    const header = document.createElement(
      "wuik-section-header",
    ) as HTMLElement & {
      focusHeading(): void;
    };
    header.setAttribute("level", "1");
    if (sectionHelp(id) !== undefined) {
      const hint = document.createElement("wuik-help-hint");
      hint.setAttribute("slot", "help");
      hint.dataset.help = id;
      header.appendChild(hint);
    }
    const body = element("div", "shell__content");
    panel.append(header, body);
    panel.hidden = true;
    main.appendChild(panel);
    panels.set(id, panel);
    headers.set(id, header);
    content[id] = body;
  }

  // -- Status bar and live regions ----------------------------------------
  const statusBar = element("footer", "shell__status");
  const saveStatus = element("span", "shell__save-status");
  const localeStatus = element("span", "shell__locale");
  statusBar.append(saveStatus, localeStatus);
  const liveRegion = element("div", "shell__live");
  liveRegion.setAttribute("role", "status");
  const alertRegion = element("div", "shell__live");
  alertRegion.setAttribute("role", "alert");

  const body = element("div", "shell__body");
  body.append(sidebar, main);
  root.append(
    skipLink,
    toolbarHost,
    body,
    statusBar,
    backdrop,
    liveRegion,
    alertRegion,
  );

  // -- State ---------------------------------------------------------------
  let current: SectionId = SECTION_IDS[0];
  let collapsed = readFoldPreference();
  let drawerOpen = false;
  let modified = false;
  let exportState: ExportState = { phase: "idle" };
  let lastCounts: (id: SectionId) => SectionCounts | null = () => null;

  function isNarrow(): boolean {
    return narrowQuery?.matches ?? false;
  }

  function setInert(el: HTMLElement, inert: boolean): void {
    el.toggleAttribute("inert", inert);
  }

  function applyLayout(): void {
    const narrow = isNarrow();
    root.classList.toggle("is-narrow", narrow);
    if (!narrow && drawerOpen) closeDrawer({ restoreFocus: false });
    nav.toggleAttribute("collapsed", !narrow && collapsed);
    sidebar.classList.toggle("is-collapsed", !narrow && collapsed);
    setInert(sidebar, narrow && !drawerOpen);
    foldButton.hidden = narrow;
    foldButton.setAttribute("aria-expanded", String(!collapsed));
  }

  function renderBadges(): void {
    for (const [id, item] of navItems) {
      const counts = lastCounts(id);
      const label = counts === null ? "" : badgeLabel(counts);
      if (counts !== null && counts.errors > 0) {
        item.setAttribute("badge-error", String(counts.errors));
      } else {
        item.removeAttribute("badge-error");
      }
      if (counts !== null && counts.warnings > 0) {
        item.setAttribute("badge-warning", String(counts.warnings));
      } else {
        item.removeAttribute("badge-warning");
      }
      if (label === "") item.removeAttribute("badge-label");
      else item.setAttribute("badge-label", label);
    }
  }

  function renderExportState(): void {
    const label = t("toolbar.export", "Export");
    switch (exportState.phase) {
      case "running":
        exportButton.textContent =
          exportState.total > 0
            ? t("export.running", "Export {{done}}/{{total}}", {
                done: String(exportState.done),
                total: String(exportState.total),
              })
            : label;
        exportButton.setAttribute("aria-busy", "true");
        saveStatus.textContent = t("export.working", "Exporting…");
        return;
      case "saved":
        exportButton.textContent = label;
        exportButton.removeAttribute("aria-busy");
        saveStatus.textContent = modified
          ? ""
          : t("export.saved", "Saved at {{time}}", {
              time: formatTime(exportState.at),
            });
        return;
      case "error":
        exportButton.textContent = label;
        exportButton.removeAttribute("aria-busy");
        saveStatus.textContent = t("export.failed", "Export failed");
        return;
      default:
        exportButton.textContent = label;
        exportButton.removeAttribute("aria-busy");
        saveStatus.textContent = "";
    }
  }

  function renderStaticText(): void {
    skipLink.textContent = t("skip", "Skip to content");
    title.textContent = t("app.title", "{{title}} — v{{version}}", {
      title: APP_TITLE,
      version: options.version,
    });
    menuButton.textContent = t("toolbar.menu", "Menu");
    menuButton.setAttribute(
      "aria-label",
      t("toolbar.menuLabel", "Open sections"),
    );
    openAnotherButton.textContent = t(
      "toolbar.openAnother",
      "Open another character",
    );
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
    helpButton.textContent = t("toolbar.help", "Help");
    helpButton.setAttribute(
      "aria-label",
      t("toolbar.helpLabel", "Help and keyboard shortcuts"),
    );
    themeToggle.textContent = currentThemeIsDark()
      ? t("app.themeToggleLight", "Switch to light mode")
      : t("app.themeToggleDark", "Switch to dark mode");
    localeSwitcher.setAttribute("label", t("app.languageLabel", "Language"));
    modifiedIndicator.textContent = modified
      ? t("app.unsavedChanges", "Unsaved changes")
      : "";
    nav.setAttribute("label", t("nav.label", "Sections"));
    for (const { id, el } of navGroups)
      el.setAttribute("label", groupLabel(id));
    for (const [id, item] of navItems) {
      const text = item.lastChild;
      if (text) text.textContent = sectionTitle(id);
    }
    for (const id of SECTION_IDS) {
      const header = headers.get(id);
      header?.setAttribute("heading", sectionTitle(id));
      header?.setAttribute("description", sectionDescription(id));
      const hint = header?.querySelector("wuik-help-hint");
      if (hint) {
        hint.setAttribute("label", sectionHelpLabel(id));
        hint.textContent = sectionHelp(id) ?? "";
      }
    }
    foldButton.textContent = collapsed
      ? t("nav.expand", "Expand sidebar")
      : t("nav.collapse", "Collapse sidebar");
    foldButton.setAttribute("aria-label", foldButton.textContent);
    narrowNotice.textContent = t(
      "narrow.notice",
      "This window is narrow for editing; widen it to at least 1024 px.",
    );
    localeStatus.textContent = (
      getI18n()?.resolvedLanguage ??
      getI18n()?.language ??
      "en"
    ).toUpperCase();
    document.title = documentTitle();
    renderExportState();
  }

  function documentTitle(): string {
    return `${sectionTitle(current)} — ${APP_TITLE}`;
  }

  // -- Behaviour -----------------------------------------------------------
  function goTo(id: SectionId, goOptions: { focus?: boolean } = {}): void {
    current = id;
    for (const [sectionId, panel] of panels) panel.hidden = sectionId !== id;
    nav.current = id;
    document.title = documentTitle();
    if (drawerOpen) closeDrawer({ restoreFocus: false });
    if (goOptions.focus) headers.get(id)?.focusHeading();
  }

  function openDrawer(): void {
    if (!isNarrow() || drawerOpen) return;
    drawerOpen = true;
    sidebar.classList.add("is-open");
    backdrop.hidden = false;
    for (const el of [toolbarHost, main, statusBar]) setInert(el, true);
    setInert(sidebar, false);
    menuButton.setAttribute("aria-expanded", "true");
    const first = navItems.get(current) ?? navItems.values().next().value;
    first?.shadowRoot?.querySelector("button")?.focus();
  }

  function closeDrawer(closeOptions: { restoreFocus?: boolean } = {}): void {
    if (!drawerOpen) return;
    drawerOpen = false;
    sidebar.classList.remove("is-open");
    backdrop.hidden = true;
    for (const el of [toolbarHost, main, statusBar]) setInert(el, false);
    setInert(sidebar, isNarrow());
    menuButton.setAttribute("aria-expanded", "false");
    if (closeOptions.restoreFocus) {
      menuButton.shadowRoot?.querySelector("button")?.focus();
    }
  }

  nav.addEventListener("wuik-navigate", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    if (!SECTION_IDS.includes(value as SectionId)) return;
    event.preventDefault();
    options.onNavigate?.(value as SectionId);
    goTo(value as SectionId, { focus: true });
  });

  menuButton.addEventListener("click", () =>
    drawerOpen ? closeDrawer({ restoreFocus: true }) : openDrawer(),
  );
  backdrop.addEventListener("click", () => closeDrawer({ restoreFocus: true }));
  const onDrawerKeydown = (event: KeyboardEvent): void => {
    if (drawerOpen && event.key === "Escape") {
      event.preventDefault();
      closeDrawer({ restoreFocus: true });
    }
  };
  document.addEventListener("keydown", onDrawerKeydown);

  foldButton.addEventListener("click", () => {
    collapsed = !collapsed;
    writeFoldPreference(collapsed);
    applyLayout();
    renderStaticText();
  });

  themeToggle.addEventListener("click", () => {
    document.documentElement.setAttribute(
      "data-theme",
      currentThemeIsDark() ? "light" : "dark",
    );
    renderStaticText();
  });

  undoButton.addEventListener("click", options.onUndo);
  redoButton.addEventListener("click", options.onRedo);
  exportButton.addEventListener("click", options.onExport);
  helpButton.addEventListener("click", options.onHelp);
  openAnotherButton.addEventListener("click", options.onOpenAnother);

  narrowQuery?.addEventListener("change", applyLayout);
  const stopLocale = onLocaleChange(() => {
    renderStaticText();
    renderBadges();
  });

  renderStaticText();
  applyLayout();
  goTo(current);
  setUndoRedoEnabled(false, false);

  function setUndoRedoEnabled(canUndo: boolean, canRedo: boolean): void {
    undoButton.toggleAttribute("disabled", !canUndo);
    redoButton.toggleAttribute("disabled", !canRedo);
  }

  function say(region: HTMLElement, message: string): void {
    // Cleared first so an identical message is announced again.
    region.textContent = "";
    window.setTimeout(() => {
      region.textContent = message;
    }, 50);
  }

  return {
    element: root,
    content,
    undoButton,
    redoButton,
    exportButton,
    get current() {
      return current;
    },
    goTo,
    setBadges(countsFor) {
      lastCounts = countsFor;
      renderBadges();
    },
    setUndoRedoEnabled,
    setModified(next) {
      modified = next;
      renderStaticText();
    },
    setExportState(next) {
      exportState = next;
      renderExportState();
    },
    announce: (message) => say(liveRegion, message),
    alert: (message) => say(alertRegion, message),
    openDrawer,
    closeDrawer,
    destroy() {
      stopLocale();
      document.removeEventListener("keydown", onDrawerKeydown);
      narrowQuery?.removeEventListener("change", applyLayout);
      root.remove();
    },
  };
}
