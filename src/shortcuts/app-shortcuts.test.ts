import { beforeEach, describe, expect, it } from "vitest";
import {
  appShortcutActions,
  getAppShortcuts,
  registerAppShortcutActions,
  resetAppShortcutsForTests,
} from "./app-shortcuts.ts";

describe("registerAppShortcutActions", () => {
  it("registers every declared app action with its declared default key", () => {
    const manager = getAppShortcuts();
    const bindings = manager.list();

    for (const action of appShortcutActions()) {
      const binding = bindings.find((b) => b.id === action.id);
      expect(binding).toBeDefined();
      expect(binding?.key).toBe(action.defaultKey);
      expect(binding?.isDefault).toBe(true);
    }
  });

  it("registers no two actions under the same default key (edge case: silent shadowing)", () => {
    const keys = appShortcutActions().map((a) => a.defaultKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("is idempotent: calling it twice on the same manager does not duplicate rows (edge case: re-import/re-mount)", () => {
    const manager = getAppShortcuts();
    registerAppShortcutActions(manager);
    registerAppShortcutActions(manager);

    const ids = manager.list().map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids.length).toBe(appShortcutActions().length);
  });
});

describe("getAppShortcuts", () => {
  beforeEach(() => {
    resetAppShortcutsForTests();
  });

  it("returns the same manager instance across repeated calls", () => {
    expect(getAppShortcuts()).toBe(getAppShortcuts());
  });

  it("returns a fresh manager with defaults restored after resetAppShortcutsForTests (error/state-leak path)", () => {
    const before = getAppShortcuts();
    before.rebind("undo", "Ctrl+Alt+Z");
    expect(before.getBinding("undo")).toBe("Ctrl+Alt+Z");

    resetAppShortcutsForTests();

    const after = getAppShortcuts();
    expect(after).not.toBe(before);
    expect(after.getBinding("undo")).toBe("Ctrl+Z");
  });
});

describe("shortcut labels", () => {
  it("re-resolve in the active language when the locale changes", async () => {
    const { getI18n, initAppI18n } = await import("../i18n/i18n.ts");
    await initAppI18n();
    const manager = getAppShortcuts();
    expect(manager.list().find((b) => b.id === "undo")?.label).toBe("Undo");
    await getI18n()?.changeLanguage("fr");
    const undo = manager.list().find((b) => b.id === "undo");
    expect(undo?.label).toBe("Annuler");
    expect(undo?.key).toBe("Ctrl+Z");
    await getI18n()?.changeLanguage("en");
    window.localStorage.clear();
  });
});
