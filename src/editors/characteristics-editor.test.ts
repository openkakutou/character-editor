import { describe, expect, it, vi } from "vitest";
import type { CharacterData } from "../wasm/types.ts";
import { renderCharacteristicsEditor } from "./characteristics-editor.ts";

function fixtureCharacter(
  overrides: Partial<CharacterData> = {},
): CharacterData {
  return {
    name: "Kung Fu Man",
    author: "Elecbyte",
    spriteFile: "kfm.sff",
    animationFile: "kfm.air",
    soundFile: "kfm.snd",
    commandFile: "kfm.cmd",
    constantsFile: "kfm.cns",
    stateFiles: ["kfm.st"],
    palettes: ["kfm1.act", "kfm2.act"],
    animations: [],
    sprites: [],
    stateDefs: [],
    ...overrides,
  };
}

function fieldInput(root: HTMLElement, field: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
  if (!el) throw new Error(`field not found: ${field}`);
  return el;
}

function listRows(root: HTMLElement, field: string): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-list="${field}"] .characteristics-editor__list-row`,
    ),
  );
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

describe("renderCharacteristicsEditor", () => {
  it("pre-fills every scalar field with the loaded character's current value", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    expect(fieldInput(root, "name").value).toBe("Kung Fu Man");
    expect(fieldInput(root, "author").value).toBe("Elecbyte");
    expect(fieldInput(root, "spriteFile").value).toBe("kfm.sff");
    expect(fieldInput(root, "animationFile").value).toBe("kfm.air");
    expect(fieldInput(root, "soundFile").value).toBe("kfm.snd");
    expect(fieldInput(root, "commandFile").value).toBe("kfm.cmd");
    expect(fieldInput(root, "constantsFile").value).toBe("kfm.cns");
  });

  it("pre-fills the stateFiles and palettes lists with one row per existing entry", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    const stateRows = listRows(root, "stateFiles");
    expect(stateRows).toHaveLength(1);
    expect(stateRows[0].querySelector<HTMLInputElement>("input")?.value).toBe(
      "kfm.st",
    );

    const paletteRows = listRows(root, "palettes");
    expect(paletteRows).toHaveLength(2);
    expect(
      paletteRows.map(
        (row) => row.querySelector<HTMLInputElement>("input")?.value,
      ),
    ).toEqual(["kfm1.act", "kfm2.act"]);
  });

  it("commits a valid name edit to the model immediately", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    setValue(fieldInput(root, "name"), "Ryu");

    expect(onChange).toHaveBeenCalledWith({ name: "Ryu" });
  });

  it("shows a visible validation error and does not commit when name is cleared to empty", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    setValue(fieldInput(root, "name"), "");

    expect(onChange).not.toHaveBeenCalled();
    const nameInput = fieldInput(root, "name");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.classList.contains("is-invalid")).toBe(true);
    expect(
      root.querySelector('[data-field-error="name"]')?.textContent,
    ).toBeTruthy();
  });

  it("treats a whitespace-only name the same as empty", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    setValue(fieldInput(root, "name"), "   ");

    expect(onChange).not.toHaveBeenCalled();
    expect(fieldInput(root, "name").classList.contains("is-invalid")).toBe(
      true,
    );
  });

  it("clears the name error once a valid value is typed again", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    setValue(fieldInput(root, "name"), "");
    setValue(fieldInput(root, "name"), "Ken");

    expect(fieldInput(root, "name").classList.contains("is-invalid")).toBe(
      false,
    );
    expect(onChange).toHaveBeenLastCalledWith({ name: "Ken" });
  });

  it("commits an optional scalar field cleared to empty without any error", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    setValue(fieldInput(root, "author"), "");

    expect(onChange).toHaveBeenCalledWith({ author: "" });
    expect(fieldInput(root, "author").classList.contains("is-invalid")).toBe(
      false,
    );
  });

  it("adds a new empty row to a list when its Add control is activated", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter({ stateFiles: [] }), {
      onChange: vi.fn(),
    });

    const addButton = root.querySelector<HTMLElement>(
      '[data-list-add="stateFiles"]',
    );
    if (!addButton) throw new Error("add button not found");
    addButton.click();

    expect(listRows(root, "stateFiles")).toHaveLength(1);
  });

  it("commits a newly added list row's value once filled in", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter({ stateFiles: [] }), {
      onChange,
    });

    root.querySelector<HTMLElement>('[data-list-add="stateFiles"]')?.click();
    const row = listRows(root, "stateFiles")[0];
    const input = row.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("row input not found");
    setValue(input, "extra.st");

    expect(onChange).toHaveBeenCalledWith({ stateFiles: ["extra.st"] });
  });

  it("flags a blank list row on blur and excludes it from the committed array", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(
      root,
      fixtureCharacter({ palettes: ["kfm1.act"] }),
      {
        onChange,
      },
    );

    root.querySelector<HTMLElement>('[data-list-add="palettes"]')?.click();
    const rows = listRows(root, "palettes");
    const newRow = rows[rows.length - 1];
    const input = newRow.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("row input not found");
    blur(input);

    expect(input.classList.contains("is-invalid")).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ palettes: ["kfm1.act"] });
  });

  it("removes a list row and recommits the array without it", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    const firstRow = listRows(root, "palettes")[0];
    firstRow
      .querySelector<HTMLElement>('[data-list-remove="palettes"]')
      ?.click();

    expect(listRows(root, "palettes")).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith({ palettes: ["kfm2.act"] });
  });

  it("gives each list row's remove control a distinct, indexed accessible name", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    const removers = root.querySelectorAll('[data-list-remove="palettes"]');
    expect(removers).toHaveLength(2);
    expect(removers[0].getAttribute("aria-label")).toContain("1");
    expect(removers[1].getAttribute("aria-label")).toContain("2");
  });

  it("replaces previous content instead of appending on repeated renders", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });
    renderCharacteristicsEditor(root, fixtureCharacter({ name: "Second" }), {
      onChange: vi.fn(),
    });

    expect(root.querySelectorAll('[data-field="name"]')).toHaveLength(1);
    expect(fieldInput(root, "name").value).toBe("Second");
  });
});
