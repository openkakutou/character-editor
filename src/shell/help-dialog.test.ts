import { afterEach, describe, expect, it } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { resetAppShortcutsForTests } from "../shortcuts/app-shortcuts.ts";
import { createHelpDialog } from "./help-dialog.ts";

afterEach(() => {
  resetAppShortcutsForTests();
  window.localStorage.clear();
});

describe("help dialog", () => {
  it("lists the collision box keys", () => {
    const dialog = createHelpDialog();
    const keys = [
      ...dialog.element.querySelectorAll(".help-dialog__clsn kbd"),
    ].map((k) => k.textContent);
    expect(keys).toEqual(["R", "← ↑ → ↓", "Shift + ← ↑ → ↓", "Escape"]);
    dialog.destroy();
  });

  it("translates the collision box rows when the language changes", async () => {
    await initAppI18n();
    const dialog = createHelpDialog();
    await getI18n()?.changeLanguage("fr");
    expect(
      dialog.element.querySelector(".help-dialog__clsn")?.textContent,
    ).toContain("mode redimensionnement");
    const keys = [
      ...dialog.element.querySelectorAll(".help-dialog__clsn kbd"),
    ].map((k) => k.textContent);
    expect(keys.at(-1)).toBe("Échap");
    await getI18n()?.changeLanguage("en");
    dialog.destroy();
  });
});
