import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAppHistory,
  isDirty,
  resetAppHistoryForTests,
} from "../history/app-history.ts";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import type { SpritePixelResult } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { renderPaletteEditor } from "./palette-editor.ts";
import {
  blankPalette,
  colorToHex,
  serializeActBytes,
  withColor,
} from "./palette.ts";

function makeCharacter(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    name: "Test",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [
      {
        index: 0,
        sprites: [
          {
            group: 0,
            image: 0,
            width: 10,
            height: 10,
            axisX: 0,
            axisY: 0,
            palette: 0,
          },
        ],
      },
    ],
    stateDefs: [],
    ...overrides,
  };
}

/** A stub that never touches the real WASM bridge. */
function stubResolve(): (...args: unknown[]) => Promise<SpritePixelResult[]> {
  return async () => [
    { ok: true, pixels: new Uint8Array(400), width: 10, height: 10 },
  ];
}

function sourceError(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__source-error") as HTMLElement;
}

function uploadInput(root: HTMLElement): HTMLInputElement {
  return root.querySelector(
    '.palette-editor__source input[type="file"]',
  ) as HTMLInputElement;
}

function newBlankButton(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__new-blank") as HTMLElement;
}

function duplicateButton(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__duplicate") as HTMLElement;
}

function swatches(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll(".palette-editor__swatch"));
}

/**
 * The hex color a swatch currently displays, read from its `aria-label`
 * rather than `.style.background` — jsdom's `CSSStyleDeclaration`
 * re-serializes a hex value assigned to `background` as `rgb(...)` when
 * read back, so comparing against the original hex string directly would
 * fail regardless of whether the real color is correct.
 */
function swatchHex(swatch: HTMLElement): string {
  return swatch.getAttribute("aria-label")?.split(": ")[1] ?? "";
}

function colorPicker(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__color-picker") as HTMLElement;
}

function reservedNote(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__reserved-note") as HTMLElement;
}

function saveButton(root: HTMLElement): HTMLElement {
  return root.querySelector(".palette-editor__save") as HTMLElement;
}

async function upload(root: HTMLElement, file: File): Promise<void> {
  const input = uploadInput(root);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => {}); // flush the read-file microtask
}

describe("renderPaletteEditor", () => {
  beforeEach(() => {
    resetAppHistoryForTests();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing when no character is loaded", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, null, null);
    expect(root.children.length).toBe(0);
  });

  it("renders nothing when sffBytes is not loaded", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), null);
    expect(root.children.length).toBe(0);
  });

  it("starts with no active palette and a disabled duplicate button", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array());
    expect(swatches(root)).toHaveLength(0);
    expect(duplicateButton(root).hasAttribute("disabled")).toBe(true);
  });

  it("starting a blank palette shows 256 black swatches with index 0 selected", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      resolveSpritePixels: stubResolve(),
    });
    newBlankButton(root).click();

    const rows = swatches(root);
    expect(rows).toHaveLength(256);
    expect(swatchHex(rows[0])).toBe(colorToHex({ r: 0, g: 0, b: 0 }));
    expect(rows[0].classList.contains("is-selected")).toBe(true);
    expect(duplicateButton(root).hasAttribute("disabled")).toBe(false);
  });

  it("flags index 0 as reserved but selecting another index hides the note", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      resolveSpritePixels: stubResolve(),
    });
    newBlankButton(root).click();

    expect(reservedNote(root).hidden).toBe(false);

    swatches(root)[5].click();
    expect(reservedNote(root).hidden).toBe(true);
    expect(swatches(root)[5].classList.contains("is-selected")).toBe(true);
    expect(swatches(root)[0].classList.contains("is-selected")).toBe(false);
  });

  it("editing the color picker updates the selected swatch without rebuilding the picker element", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      resolveSpritePixels: stubResolve(),
    });
    newBlankButton(root).click();
    swatches(root)[3].click();

    const picker = colorPicker(root);
    picker.setAttribute("value", "#112233");
    picker.dispatchEvent(
      new CustomEvent("wuik-change", { detail: { value: "#112233" } }),
    );

    // The exact same picker element is still in the document (not replaced).
    expect(colorPicker(root)).toBe(picker);
    expect(swatchHex(swatches(root)[3])).toBe("#112233");
  });

  it("uploads a well-formed .act file and shows its colors", async () => {
    let palette = blankPalette();
    palette = withColor(palette, 254, { r: 9, g: 8, b: 7 }); // file position 1 -> semantic index 254
    const bytes = serializeActBytes(palette);
    const file = new File([bytes as Uint8Array<ArrayBuffer>], "test.act");

    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      readFileBytes: async () => bytes,
      resolveSpritePixels: stubResolve(),
    });

    await upload(root, file);

    expect(swatches(root)).toHaveLength(256);
    expect(swatchHex(swatches(root)[254])).toBe("#090807");
    expect(sourceError(root).hidden).toBe(true);
  });

  it("shows a clear error and leaves the editor inactive for a malformed .act upload", async () => {
    const file = new File([new Uint8Array(10)], "bad.act");
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      readFileBytes: async () => new Uint8Array(10),
    });

    await upload(root, file);

    expect(sourceError(root).hidden).toBe(false);
    expect(sourceError(root).textContent).toContain("10");
    expect(swatches(root)).toHaveLength(0);
  });

  it("duplicating the current palette preserves already-edited colors", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      resolveSpritePixels: stubResolve(),
    });
    newBlankButton(root).click();
    swatches(root)[7].click();
    colorPicker(root).dispatchEvent(
      new CustomEvent("wuik-change", { detail: { value: "#abcdef" } }),
    );

    duplicateButton(root).click();

    expect(swatchHex(swatches(root)[7])).toBe("#abcdef");
  });

  it("requests a live-recolored preview using the current palette's file-order bytes", () => {
    const resolveSpritePixels = vi.fn(stubResolve());
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array([1, 2, 3]), {
      resolveSpritePixels,
    });
    newBlankButton(root).click();

    expect(resolveSpritePixels).toHaveBeenCalledTimes(1);
    const [sffBytesArg, requestsArg, overrideArg] =
      resolveSpritePixels.mock.calls[0];
    expect(sffBytesArg).toEqual(new Uint8Array([1, 2, 3]));
    expect(requestsArg).toEqual([[0, 0]]);
    expect(overrideArg).toEqual(serializeActBytes(blankPalette()));
  });

  it("shows a status message instead of crashing when the character has no sprites to preview", () => {
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter({ sprites: [] }), new Uint8Array());
    expect(() => newBlankButton(root).click()).not.toThrow();
    expect(
      root.querySelector(".palette-editor__preview-status")?.textContent,
    ).toMatch(/no sprites/i);
  });

  it("saving downloads the current palette serialized as .act bytes", () => {
    const triggerDownload = vi.fn();
    const root = document.createElement("div");
    renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
      resolveSpritePixels: stubResolve(),
      triggerDownload,
    });
    newBlankButton(root).click();
    swatches(root)[9].click();
    colorPicker(root).dispatchEvent(
      new CustomEvent("wuik-change", { detail: { value: "#010203" } }),
    );

    saveButton(root).click();

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [bytesArg, fileNameArg] = triggerDownload.mock.calls[0];
    expect(fileNameArg).toMatch(/\.act$/);
    const expected = withColor(blankPalette(), 9, { r: 1, g: 2, b: 3 });
    expect(bytesArg).toEqual(serializeActBytes(expected));
  });

  describe("undo/redo (backlog item 010)", () => {
    it("records an undoable/redoable entry and marks the document dirty when a color changes, restoring it via the returned handle's refresh", () => {
      const root = document.createElement("div");
      expect(isDirty()).toBe(false);
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
        {
          resolveSpritePixels: stubResolve(),
        },
      );
      newBlankButton(root).click();
      // "New blank palette" is itself an undoable, dirtying action.
      expect(isDirty()).toBe(true);
      resetAppHistoryForTests();
      expect(isDirty()).toBe(false);

      swatches(root)[3].click();
      colorPicker(root).dispatchEvent(
        new CustomEvent("wuik-change", { detail: { value: "#112233" } }),
      );

      expect(isDirty()).toBe(true);
      expect(getAppHistory().canUndo).toBe(true);

      getAppHistory().undo();
      handle.refresh();
      expect(swatchHex(swatches(root)[3])).toBe(
        colorToHex({ r: 0, g: 0, b: 0 }),
      );

      getAppHistory().redo();
      handle.refresh();
      expect(swatchHex(swatches(root)[3])).toBe("#112233");
    });

    it("records an undoable entry for starting a new blank palette", () => {
      const root = document.createElement("div");
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
        {
          resolveSpritePixels: stubResolve(),
        },
      );

      newBlankButton(root).click();

      expect(getAppHistory().canUndo).toBe(true);
      getAppHistory().undo();
      handle.refresh();
      expect(swatches(root)).toHaveLength(0);
      expect(duplicateButton(root).hasAttribute("disabled")).toBe(true);
    });

    it("records an undoable entry for duplicating the current palette", () => {
      const root = document.createElement("div");
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
        {
          resolveSpritePixels: stubResolve(),
        },
      );
      newBlankButton(root).click();
      swatches(root)[7].click();
      colorPicker(root).dispatchEvent(
        new CustomEvent("wuik-change", { detail: { value: "#abcdef" } }),
      );

      duplicateButton(root).click();
      expect(getAppHistory().canUndo).toBe(true);
      // One undo reverts the duplicate action; the color-edit entry
      // underneath it is still there.
      getAppHistory().undo();
      handle.refresh();
      expect(getAppHistory().canUndo).toBe(true);
    });

    it("records an undoable entry for a successful .act upload", async () => {
      let palette = blankPalette();
      palette = withColor(palette, 254, { r: 9, g: 8, b: 7 });
      const bytes = serializeActBytes(palette);
      const file = new File([bytes as Uint8Array<ArrayBuffer>], "test.act");

      const root = document.createElement("div");
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
        {
          readFileBytes: async () => bytes,
          resolveSpritePixels: stubResolve(),
        },
      );

      await upload(root, file);
      expect(getAppHistory().canUndo).toBe(true);

      getAppHistory().undo();
      handle.refresh();
      expect(swatches(root)).toHaveLength(0);
    });

    it("coalesces rapid successive edits to the same swatch into a single undo step", () => {
      const root = document.createElement("div");
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
        {
          resolveSpritePixels: stubResolve(),
        },
      );
      newBlankButton(root).click();
      swatches(root)[3].click();
      // Isolate the color-edit entries from the "new blank" entry above.
      resetAppHistoryForTests();

      colorPicker(root).dispatchEvent(
        new CustomEvent("wuik-change", { detail: { value: "#111111" } }),
      );
      colorPicker(root).dispatchEvent(
        new CustomEvent("wuik-change", { detail: { value: "#222222" } }),
      );

      getAppHistory().undo();
      handle.refresh();

      expect(swatchHex(swatches(root)[3])).toBe(
        colorToHex({ r: 0, g: 0, b: 0 }),
      );
      expect(getAppHistory().canUndo).toBe(false);
    });

    it("a no-op refresh call before any palette is started does not throw", () => {
      const root = document.createElement("div");
      const handle = renderPaletteEditor(
        root,
        makeCharacter(),
        new Uint8Array(),
      );

      expect(() => handle.refresh()).not.toThrow();
    });

    it("returns a no-op refresh handle when nothing is rendered (no character/sffBytes)", () => {
      const root = document.createElement("div");
      const handle = renderPaletteEditor(root, null, null);

      expect(() => handle.refresh()).not.toThrow();
    });

    it("calls onHistoryPush every time a local edit records a history entry, so an external toolbar can stay in sync", () => {
      const onHistoryPush = vi.fn();
      const root = document.createElement("div");
      renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
        resolveSpritePixels: stubResolve(),
        onHistoryPush,
      });

      newBlankButton(root).click();
      expect(onHistoryPush).toHaveBeenCalledTimes(1);

      swatches(root)[3].click();
      colorPicker(root).dispatchEvent(
        new CustomEvent("wuik-change", { detail: { value: "#112233" } }),
      );
      expect(onHistoryPush).toHaveBeenCalledTimes(2);

      duplicateButton(root).click();
      expect(onHistoryPush).toHaveBeenCalledTimes(3);
    });
  });

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("retranslates the static chrome and a rebuilt body, keeping the active palette and selection", async () => {
      const root = document.createElement("div");
      renderPaletteEditor(root, makeCharacter(), new Uint8Array(), {
        resolveSpritePixels: stubResolve(),
      });
      newBlankButton(root).click();
      swatches(root)[3].click();

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector("h3")?.textContent).toBe("Éditeur de palette");
      expect(newBlankButton(root).textContent).toBe("Nouvelle palette vierge");
      expect(swatches(root)).toHaveLength(256);
      expect(
        root.querySelector(".palette-editor__selected-index")?.textContent,
      ).toBe("Index 3");
      expect(swatches(root)[3].classList.contains("is-selected")).toBe(true);
    });
  });
});
