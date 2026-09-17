import { ShortcutManager } from "@openkakutou/web-ui-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { getAppShortcuts, resetAppShortcutsForTests } from "./app-shortcuts.ts";
import { renderShortcutsScreen } from "./shortcuts-screen.ts";

describe("renderShortcutsScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    resetAppShortcutsForTests();
    root = document.createElement("div");
  });

  it("renders a heading and mounts the shared shortcuts panel bound to the app's shared manager", () => {
    renderShortcutsScreen(root);

    const heading = root.querySelector("h2");
    expect(heading?.textContent).toBe("Keyboard shortcuts");

    const panel = root.querySelector("wuik-shortcuts-panel") as
      | (HTMLElement & { manager?: ShortcutManager })
      | null;
    expect(panel).not.toBeNull();
    expect(panel?.manager).toBe(getAppShortcuts());
  });

  it("binds to an explicitly passed manager instead of the shared one (edge case: injected manager)", () => {
    const customManager = new ShortcutManager({
      storageKey: "test-shortcuts-screen",
    });

    renderShortcutsScreen(root, { manager: customManager });

    const panel = root.querySelector("wuik-shortcuts-panel") as
      | (HTMLElement & { manager?: ShortcutManager })
      | null;
    expect(panel?.manager).toBe(customManager);
  });

  it("replaces previous content on a second render (edge case: re-render doesn't duplicate the panel)", () => {
    renderShortcutsScreen(root);
    renderShortcutsScreen(root);

    expect(root.querySelectorAll("wuik-shortcuts-panel").length).toBe(1);
    expect(root.querySelectorAll("h2").length).toBe(1);
  });

  it("does not throw when the manager has no registered actions (error/edge path)", () => {
    const emptyManager = new ShortcutManager({
      storageKey: "test-shortcuts-screen-empty",
    });

    expect(() =>
      renderShortcutsScreen(root, { manager: emptyManager }),
    ).not.toThrow();
  });

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("retranslates its own heading in place when the locale changes", async () => {
      renderShortcutsScreen(root);

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector("h2")?.textContent).toBe("Raccourcis clavier");
    });
  });
});
