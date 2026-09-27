import { afterEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
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

/** Every migrated text field is a `<wuik-text-input>`, never a plain `<input>` -- see .vibe/decisions/019. */
function fieldInput(root: HTMLElement, field: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(
    `wuik-text-input[data-field="${field}"]`,
  );
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

/** Simulates a keystroke: `<wuik-text-input>` reports every keystroke live via `wuik-input`, never a native "input" event -- see README.md's own documented contract. */
function typeValue(el: HTMLElement, value: string): void {
  el.dispatchEvent(new CustomEvent("wuik-input", { detail: { value } }));
}

/** Simulates leaving the field (edited or not) -- `focusout` is composed/bubbling and so is the one event that still crosses the component's shadow boundary, unlike the native, uncomposed `blur` this app used to listen to directly. See .vibe/decisions/019. */
function leaveField(el: HTMLElement): void {
  el.dispatchEvent(new Event("focusout", { bubbles: true, composed: true }));
}

describe("renderCharacteristicsEditor", () => {
  it("pre-fills every scalar field with the loaded character's current value", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    expect(fieldInput(root, "name").getAttribute("value")).toBe("Kung Fu Man");
    expect(fieldInput(root, "author").getAttribute("value")).toBe("Elecbyte");
    expect(fieldInput(root, "spriteFile").getAttribute("value")).toBe(
      "kfm.sff",
    );
    expect(fieldInput(root, "animationFile").getAttribute("value")).toBe(
      "kfm.air",
    );
    expect(fieldInput(root, "soundFile").getAttribute("value")).toBe("kfm.snd");
    expect(fieldInput(root, "commandFile").getAttribute("value")).toBe(
      "kfm.cmd",
    );
    expect(fieldInput(root, "constantsFile").getAttribute("value")).toBe(
      "kfm.cns",
    );
  });

  it("marks only the Name field as required", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    expect(fieldInput(root, "name").hasAttribute("required")).toBe(true);
    expect(fieldInput(root, "author").hasAttribute("required")).toBe(false);
    expect(fieldInput(root, "spriteFile").hasAttribute("required")).toBe(false);
  });

  it("pre-fills the stateFiles and palettes lists with one row per existing entry", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter(), {
      onChange: vi.fn(),
    });

    const stateRows = listRows(root, "stateFiles");
    expect(stateRows).toHaveLength(1);
    expect(
      stateRows[0]
        .querySelector<HTMLElement>("wuik-text-input")
        ?.getAttribute("value"),
    ).toBe("kfm.st");

    const paletteRows = listRows(root, "palettes");
    expect(paletteRows).toHaveLength(2);
    expect(
      paletteRows.map((row) =>
        row
          .querySelector<HTMLElement>("wuik-text-input")
          ?.getAttribute("value"),
      ),
    ).toEqual(["kfm1.act", "kfm2.act"]);
  });

  it("commits a valid name edit to the model immediately", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    typeValue(fieldInput(root, "name"), "Ryu");

    expect(onChange).toHaveBeenCalledWith({ name: "Ryu" });
  });

  it("shows a live validation error and does not commit when name is cleared to empty", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    typeValue(fieldInput(root, "name"), "");

    expect(onChange).not.toHaveBeenCalled();
    expect(fieldInput(root, "name").getAttribute("error")).toBe(
      "Name cannot be empty.",
    );
  });

  it("treats a whitespace-only name the same as empty", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    typeValue(fieldInput(root, "name"), "   ");

    expect(onChange).not.toHaveBeenCalled();
    expect(fieldInput(root, "name").getAttribute("error")).toBe(
      "Name cannot be empty.",
    );
  });

  it("clears the name error once a valid value is typed again", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    typeValue(fieldInput(root, "name"), "");
    typeValue(fieldInput(root, "name"), "Ken");

    expect(fieldInput(root, "name").hasAttribute("error")).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ name: "Ken" });
  });

  it("commits an optional scalar field cleared to empty without any error", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter(), { onChange });

    typeValue(fieldInput(root, "author"), "");

    expect(onChange).toHaveBeenCalledWith({ author: "" });
    expect(fieldInput(root, "author").hasAttribute("error")).toBe(false);
  });

  it("adds a new empty, required row to a list when its Add control is activated", () => {
    const root = document.createElement("div");
    renderCharacteristicsEditor(root, fixtureCharacter({ stateFiles: [] }), {
      onChange: vi.fn(),
    });

    const addButton = root.querySelector<HTMLElement>(
      '[data-list-add="stateFiles"]',
    );
    if (!addButton) throw new Error("add button not found");
    addButton.click();

    const rows = listRows(root, "stateFiles");
    expect(rows).toHaveLength(1);
    expect(
      rows[0].querySelector("wuik-text-input")?.hasAttribute("required"),
    ).toBe(true);
  });

  it("commits a newly added list row's value once filled in", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCharacteristicsEditor(root, fixtureCharacter({ stateFiles: [] }), {
      onChange,
    });

    root.querySelector<HTMLElement>('[data-list-add="stateFiles"]')?.click();
    const row = listRows(root, "stateFiles")[0];
    const input = row.querySelector<HTMLElement>("wuik-text-input");
    if (!input) throw new Error("row input not found");
    typeValue(input, "extra.st");

    expect(onChange).toHaveBeenCalledWith({ stateFiles: ["extra.st"] });
  });

  it("excludes a list row left blank on leave from the committed array", () => {
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
    const input = newRow.querySelector<HTMLElement>("wuik-text-input");
    if (!input) throw new Error("row input not found");
    leaveField(input);

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

    expect(
      root.querySelectorAll('wuik-text-input[data-field="name"]'),
    ).toHaveLength(1);
    expect(fieldInput(root, "name").getAttribute("value")).toBe("Second");
  });

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("renders in French, with values unchanged, once initialized under an active French locale", async () => {
      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      const root = document.createElement("div");
      renderCharacteristicsEditor(root, fixtureCharacter(), {
        onChange: vi.fn(),
      });

      const headings = [...root.querySelectorAll("h2")].map(
        (el) => el.textContent,
      );
      expect(headings).toContain("Identité");
      expect(fieldInput(root, "name").getAttribute("value")).toBe(
        "Kung Fu Man",
      );
      expect(
        root.querySelector('[data-list-add="palettes"]')?.textContent,
      ).toBe("Ajouter : palette");
    });
  });
});
