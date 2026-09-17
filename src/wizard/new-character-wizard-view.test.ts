import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import type { CharacterInputResult } from "../input/character-file-input.ts";
import type { CharacterData } from "../wasm/types.ts";
import { renderNewCharacterWizard } from "./new-character-wizard-view.ts";

function minimalCharacter(): CharacterData {
  return {
    name: "New Character",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [],
  };
}

function successResult(name: string): CharacterInputResult {
  return {
    status: "success",
    character: { ...minimalCharacter(), name },
    files: {
      def: new Uint8Array(),
      air: new Uint8Array(),
      sff: new Uint8Array(),
      cns: new Uint8Array(),
    },
  };
}

function dialog(root: HTMLElement): HTMLElement {
  const el = root.querySelector(".new-character-wizard__dialog");
  if (!el) throw new Error("dialog not found");
  return el as HTMLElement;
}

function openTrigger(root: HTMLElement): HTMLElement {
  const el = root.querySelector('[data-action="open-wizard"]');
  if (!el) throw new Error("open trigger not found");
  return el as HTMLElement;
}

function nameInput(root: HTMLElement): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>('[data-field="wizard-name"]');
  if (!el) throw new Error("name field not found");
  return el;
}

function createButton(root: HTMLElement): HTMLElement {
  const el = root.querySelector('[data-action="create-character"]');
  if (!el) throw new Error("create button not found");
  return el as HTMLElement;
}

function cancelButton(root: HTMLElement): HTMLElement {
  const el = root.querySelector('[data-action="cancel-wizard"]');
  if (!el) throw new Error("cancel button not found");
  return el as HTMLElement;
}

function errorText(root: HTMLElement): string {
  return root.querySelector(".new-character-wizard__error")?.textContent ?? "";
}

function templateGroup(root: HTMLElement): HTMLElement {
  const el = root.querySelector(".new-character-wizard__template");
  if (!el) throw new Error("template radio group not found");
  return el as HTMLElement;
}

describe("renderNewCharacterWizard", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
  });

  it("renders a closed dialog with a trigger button, defaulting to the blank template", () => {
    renderNewCharacterWizard(root, { onCreated: vi.fn() });

    expect(openTrigger(root)).not.toBeNull();
    expect(dialog(root).hasAttribute("open")).toBe(false);
    expect(templateGroup(root).getAttribute("value")).toBe("blank");
  });

  it("opens the dialog when the trigger is clicked", () => {
    renderNewCharacterWizard(root, { onCreated: vi.fn() });

    openTrigger(root).click();

    expect(dialog(root).hasAttribute("open")).toBe(true);
  });

  it("closes the dialog without creating anything when Cancel is clicked", () => {
    const onCreated = vi.fn();
    renderNewCharacterWizard(root, { onCreated });
    openTrigger(root).click();
    nameInput(root).value = "Some Name";
    nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));

    cancelButton(root).click();

    expect(dialog(root).hasAttribute("open")).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows an inline error and does not call createCharacter when Name is left blank", async () => {
    const createCharacter = vi.fn();
    renderNewCharacterWizard(root, {
      onCreated: vi.fn(),
      createCharacter,
    });
    openTrigger(root).click();

    createButton(root).click();

    expect(createCharacter).not.toHaveBeenCalled();
    expect(errorText(root)).toMatch(/name/i);
    expect(dialog(root).hasAttribute("open")).toBe(true);
  });

  it("creates a blank-template character with the entered name, closes the dialog, and reports it", async () => {
    const onCreated = vi.fn();
    const createCharacter = vi
      .fn()
      .mockResolvedValue(successResult("My Fighter"));
    renderNewCharacterWizard(root, { onCreated, createCharacter });
    openTrigger(root).click();
    nameInput(root).value = "My Fighter";
    nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));

    createButton(root).click();
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    expect(createCharacter).toHaveBeenCalledWith(
      "My Fighter",
      "blank",
      undefined,
    );
    const expected = successResult("My Fighter");
    if (expected.status !== "success") throw new Error("expected success");
    expect(onCreated).toHaveBeenCalledWith(expected.character, expected.files);
    expect(dialog(root).hasAttribute("open")).toBe(false);
  });

  it("creates a basic-template character once that option is selected", async () => {
    const onCreated = vi.fn();
    const createCharacter = vi
      .fn()
      .mockResolvedValue(successResult("Templated"));
    renderNewCharacterWizard(root, { onCreated, createCharacter });
    openTrigger(root).click();
    nameInput(root).value = "Templated";
    nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));
    templateGroup(root).dispatchEvent(
      new CustomEvent("wuik-change", { detail: { value: "basic" } }),
    );

    createButton(root).click();
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    expect(createCharacter).toHaveBeenCalledWith(
      "Templated",
      "basic",
      undefined,
    );
  });

  it("shows the failure reason and keeps the dialog open when creation fails", async () => {
    const onCreated = vi.fn();
    const createCharacter = vi.fn().mockResolvedValue({
      status: "bridge-error",
      message: "the sprite sheet is missing",
    });
    renderNewCharacterWizard(root, { onCreated, createCharacter });
    openTrigger(root).click();
    nameInput(root).value = "Someone";
    nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));

    createButton(root).click();
    await vi.waitFor(() => {
      expect(errorText(root)).toContain("the sprite sheet is missing");
    });

    expect(onCreated).not.toHaveBeenCalled();
    expect(dialog(root).hasAttribute("open")).toBe(true);
  });

  it("resets the form (name, error) each time the dialog is reopened", async () => {
    const createCharacter = vi.fn().mockResolvedValue({
      status: "bridge-error",
      message: "boom",
    });
    renderNewCharacterWizard(root, { onCreated: vi.fn(), createCharacter });
    openTrigger(root).click();
    nameInput(root).value = "Leftover";
    nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));
    createButton(root).click();
    await vi.waitFor(() => {
      expect(errorText(root)).toContain("boom");
    });
    cancelButton(root).click();

    openTrigger(root).click();

    expect(nameInput(root).value).toBe("");
    expect(errorText(root)).toBe("");
  });

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("retranslates the trigger/dialog text without closing an open dialog or clearing the entered name", async () => {
      renderNewCharacterWizard(root, { onCreated: vi.fn() });
      openTrigger(root).click();
      nameInput(root).value = "Ryu";
      nameInput(root).dispatchEvent(new Event("input", { bubbles: true }));

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(openTrigger(root).textContent).toBe("Nouveau personnage");
      expect(dialog(root).hasAttribute("open")).toBe(true);
      expect(nameInput(root).value).toBe("Ryu");
      expect(createButton(root).textContent).toBe("Créer");
      expect(cancelButton(root).textContent).toBe("Annuler");
    });

    it("retranslates a currently shown validation error in place", async () => {
      renderNewCharacterWizard(root, { onCreated: vi.fn() });
      openTrigger(root).click();
      createButton(root).click();
      expect(errorText(root)).toBe("A name is required.");

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(errorText(root)).toBe("Un nom est requis.");
    });
  });
});
