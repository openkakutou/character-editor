import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCharacterDocument,
  resetCharacterDocumentForTests,
} from "./document/character-document.ts";
import { getAppHistory, isDirty } from "./history/app-history.ts";
import { getI18n, initAppI18n } from "./i18n/i18n.ts";
import { renderApp } from "./main.ts";
import { resetWasmBridgeForTests } from "./wasm/bridge.ts";
import type { WasmBridgeOptions } from "./wasm/bridge.ts";
import { MIN_SUPPORTED_WEB_UI_KIT_VERSION } from "./web-ui-kit-version.ts";

const publicWasmDir = path.resolve(import.meta.dirname, "..", "public", "wasm");
const blankSffPath = path.resolve(
  import.meta.dirname,
  "..",
  "public",
  "wizard",
  "blank-character.sff",
);
const bridgeOptions: WasmBridgeOptions & {
  fetchBlankSffBytes: () => Promise<Uint8Array>;
} = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
  fetchBlankSffBytes: async () => new Uint8Array(readFileSync(blankSffPath)),
};

const testdataDir = path.resolve(import.meta.dirname, "wasm", "testdata");
function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

function fileFromBytes(name: string, bytes: Uint8Array): File {
  return new File([bytes as BufferSource], name);
}

function requiredFiles(): File[] {
  return [
    fileFromBytes(
      "ryu.def",
      textBytes("[Info]\nname = Main Wiring Test Character\n"),
    ),
    fileFromBytes("ryu.air", fixtureBytes("sample.air")),
    fileFromBytes("ryu.sff", fixtureBytes("v1-basic.sff")),
    fileFromBytes("ryu.cns", fixtureBytes("sample.cns")),
  ];
}

function dispatchDrop(dropZone: Element, files: File[]): void {
  const dataTransfer = { files } as unknown as DataTransfer;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  dropZone.dispatchEvent(event);
}

describe("renderApp", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    resetWasmBridgeForTests();
    resetCharacterDocumentForTests();
  });

  it("mounts a wuik-app-shell root frame with a toolbar showing the title and version, plus a theme toggle button", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.13.0");

    const shell = root.querySelector("wuik-app-shell");
    expect(shell).not.toBeNull();

    const toolbar = shell?.querySelector('[slot="toolbar"]');
    expect(toolbar?.tagName.toLowerCase()).toBe("wuik-toolbar");
    expect(toolbar?.textContent).toContain("Character Editor — v0.1.0");

    const toggle = toolbar?.querySelector('[data-action="theme-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe("Switch to dark mode");
  });

  it("toggles the page theme to dark, then back to light, when the theme button is activated", () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0");

    const toggle = root.querySelector<HTMLElement>(
      '[data-action="theme-toggle"]',
    );
    if (!toggle) throw new Error("theme toggle not found");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(toggle.textContent).toBe("Switch to light mode");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle.textContent).toBe("Switch to dark mode");
  });

  it("replaces previous content instead of appending on repeated renders", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.13.0");
    renderApp(root, "0.2.0", "0.13.0");

    expect(root.querySelectorAll("wuik-app-shell")).toHaveLength(1);
    expect(root.querySelector('[slot="toolbar"]')?.textContent).toContain(
      "Character Editor — v0.2.0",
    );
  });

  it("shows a clear, announced error instead of an unstyled shell when web-ui-kit is too old", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");

    expect(root.querySelector("wuik-app-shell")).toBeNull();
    const alert = root.querySelector('.web-ui-kit-version-error[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("aria-live")).toBe("assertive");
    expect(alert?.textContent).toContain(MIN_SUPPORTED_WEB_UI_KIT_VERSION);
    expect(alert?.textContent).toContain("0.3.0");
  });

  it("replaces a previously rendered error state once a supported version is given", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");
    renderApp(root, "0.1.0", "0.13.0");

    expect(
      root.querySelector('.web-ui-kit-version-error[role="alert"]'),
    ).toBeNull();
    expect(root.querySelector("wuik-app-shell")).not.toBeNull();
  });

  it("mounts the character file input into the shell's main content", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    expect(dropZone).not.toBeNull();
  });

  describe("new-character wizard (backlog item 010)", () => {
    it("mounts a New Character trigger alongside the file input", () => {
      const root = document.createElement("div");

      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      expect(root.querySelector('[data-action="open-wizard"]')).not.toBeNull();
    });

    it("creates a valid blank character through the wizard and wires it up exactly like an import", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      root.querySelector<HTMLElement>('[data-action="open-wizard"]')?.click();
      const nameField = root.querySelector<HTMLInputElement>(
        '[data-field="wizard-name"]',
      );
      if (!nameField) throw new Error("wizard name field not found");
      nameField.value = "Wizard Fighter";
      nameField.dispatchEvent(new Event("input", { bubbles: true }));

      root
        .querySelector<HTMLElement>('[data-action="create-character"]')
        ?.click();

      await vi.waitFor(() => {
        expect(root.querySelector(".characteristics-editor")).not.toBeNull();
      });
      expect(getCharacterDocument()?.character.name).toBe("Wizard Fighter");
      expect(
        root.querySelector<HTMLInputElement>('[data-field="name"]')?.value,
      ).toBe("Wizard Fighter");
      // The dialog closes once the character is created.
      expect(
        root
          .querySelector(".new-character-wizard__dialog")
          ?.hasAttribute("open"),
      ).toBe(false);
    });

    it("creates a basic-template character with real content in the state and animation editors", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      root.querySelector<HTMLElement>('[data-action="open-wizard"]')?.click();
      root
        .querySelector(".new-character-wizard__template")
        ?.dispatchEvent(
          new CustomEvent("wuik-change", { detail: { value: "basic" } }),
        );
      const nameField = root.querySelector<HTMLInputElement>(
        '[data-field="wizard-name"]',
      );
      if (!nameField) throw new Error("wizard name field not found");
      nameField.value = "Templated Fighter";
      nameField.dispatchEvent(new Event("input", { bubbles: true }));

      root
        .querySelector<HTMLElement>('[data-action="create-character"]')
        ?.click();

      await vi.waitFor(() => {
        expect(getCharacterDocument()?.character.name).toBe(
          "Templated Fighter",
        );
      });
      expect(getCharacterDocument()?.character.animations).toHaveLength(1);
      expect(getCharacterDocument()?.character.stateDefs).toHaveLength(1);
    });
  });

  it("stores the loaded character and raw file bytes in the in-memory document once the 4 required files load successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(getCharacterDocument()).not.toBeNull();
    });

    const doc = getCharacterDocument();
    expect(doc?.character.name).toBe("Main Wiring Test Character");
    expect(doc?.files.def).toBeInstanceOf(Uint8Array);
  });

  it("mounts the characteristics editor once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".characteristics-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".characteristics-editor")).not.toBeNull();
    });
    const nameInput = root.querySelector<HTMLInputElement>(
      '[data-field="name"]',
    );
    expect(nameInput?.value).toBe("Main Wiring Test Character");
  });

  it("reflects a characteristics-editor edit in the in-memory document immediately", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".characteristics-editor")).not.toBeNull();
    });

    const nameInput = root.querySelector<HTMLInputElement>(
      '[data-field="name"]',
    );
    if (!nameInput) throw new Error("name field not found");
    nameInput.value = "Renamed";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(getCharacterDocument()?.character.name).toBe("Renamed");
  });

  describe("undo/redo (backlog item 010)", () => {
    async function loadAndRename(root: HTMLElement): Promise<HTMLInputElement> {
      const dropZone = root.querySelector(".file-input__dropzone");
      if (!dropZone) throw new Error("dropzone not found");
      dispatchDrop(dropZone, requiredFiles());
      await vi.waitFor(() => {
        expect(root.querySelector(".characteristics-editor")).not.toBeNull();
      });
      const nameInput = root.querySelector<HTMLInputElement>(
        '[data-field="name"]',
      );
      if (!nameInput) throw new Error("name field not found");
      return nameInput;
    }

    function requireButton(root: HTMLElement, action: string): HTMLElement {
      const button = root.querySelector<HTMLElement>(
        `[data-action="${action}"]`,
      );
      if (!button) throw new Error(`${action} button not found`);
      return button;
    }

    it("renders Undo and Redo buttons in the toolbar, disabled while there is nothing to undo/redo", () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      expect(requireButton(root, "undo").hasAttribute("disabled")).toBe(true);
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(true);
    });

    it("enables Undo after an edit, reverts the edit and enables Redo when Undo is clicked", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      nameInput.value = "Renamed";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(requireButton(root, "undo").hasAttribute("disabled")).toBe(false);

      requireButton(root, "undo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );

      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(false);
      const nameInputAfterUndo = root.querySelector<HTMLInputElement>(
        '[data-field="name"]',
      );
      if (!nameInputAfterUndo) throw new Error("name field not found");
      expect(nameInputAfterUndo.value).toBe("Main Wiring Test Character");
    });

    it("re-applies the edit when Redo is clicked after an Undo", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      nameInput.value = "Renamed";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      requireButton(root, "undo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );

      requireButton(root, "redo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );

      expect(getCharacterDocument()?.character.name).toBe("Renamed");
    });

    it("undoes edits across two different editors in the correct order, without the command editor's own mount re-seeding corrupting the redo stack", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      nameInput.value = "Renamed";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));

      const addStateDefButton = requireButton(root, "add-statedef");
      const statedefCountBefore = root.querySelectorAll(
        ".state-editor__statedef",
      ).length;
      addStateDefButton.click();
      expect(root.querySelectorAll(".state-editor__statedef")).toHaveLength(
        statedefCountBefore + 1,
      );

      // Undo the state-editor edit: only the statedef count reverts, the
      // characteristics-editor rename is untouched.
      requireButton(root, "undo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(root.querySelectorAll(".state-editor__statedef")).toHaveLength(
        statedefCountBefore,
      );
      expect(getCharacterDocument()?.character.name).toBe("Renamed");
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(false);

      // Undo the characteristics-editor rename too.
      requireButton(root, "undo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
      expect(requireButton(root, "undo").hasAttribute("disabled")).toBe(true);

      // Redo both back in order.
      requireButton(root, "redo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(getCharacterDocument()?.character.name).toBe("Renamed");
      requireButton(root, "redo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(root.querySelectorAll(".state-editor__statedef")).toHaveLength(
        statedefCountBefore + 1,
      );
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(true);
    });

    it("clicking Undo or Redo when there is nothing to undo/redo is a safe no-op", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });
      await loadAndRename(root);

      expect(() =>
        requireButton(root, "undo").dispatchEvent(
          new Event("click", { bubbles: true }),
        ),
      ).not.toThrow();
      expect(() =>
        requireButton(root, "redo").dispatchEvent(
          new Event("click", { bubbles: true }),
        ),
      ).not.toThrow();
      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
    });

    it("shows an unsaved-changes indicator once an edit is made, and none beforehand", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });
      expect(isDirty()).toBe(false);
      expect(root.querySelector(".app-unsaved-indicator")?.textContent).toBe(
        "",
      );

      const nameInput = await loadAndRename(root);
      nameInput.value = "Renamed";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(isDirty()).toBe(true);
      expect(
        root.querySelector(".app-unsaved-indicator")?.textContent,
      ).not.toBe("");
    });

    it("keeps the shared history usable directly, not just through the toolbar buttons", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });
      const nameInput = await loadAndRename(root);
      nameInput.value = "Renamed";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(getAppHistory().canUndo).toBe(true);
    });
  });

  it("mounts the sprite browser once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".sprite-browser")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".sprite-browser")).not.toBeNull();
    });
  });

  it("reflects a sprite browser edit in the in-memory document's spriteEdits", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".sprite-browser")).not.toBeNull();
    });

    root
      .querySelector<HTMLButtonElement>(".sprite-browser__group-toggle")
      ?.click();
    root
      .querySelectorAll<HTMLButtonElement>(".sprite-browser__sprite")[0]
      ?.click();
    root.querySelector<HTMLButtonElement>(".sprite-browser__delete")?.click();
    root
      .querySelector<HTMLButtonElement>(".sprite-browser__delete-confirm")
      ?.click();

    expect(getCharacterDocument()?.spriteEdits).toEqual([
      { kind: "delete", group: 0, image: 0 },
    ]);
  });

  it("mounts the palette editor once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".palette-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".palette-editor")).not.toBeNull();
    });
  });

  it("undoes a palette-editor edit through the shared toolbar Undo button, not just the palette editor's own history", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".palette-editor")).not.toBeNull();
    });

    const newBlank = root.querySelector<HTMLElement>(
      ".palette-editor__new-blank",
    );
    if (!newBlank) throw new Error("new-blank button not found");
    newBlank.click();

    const undoButton = root.querySelector<HTMLElement>('[data-action="undo"]');
    if (!undoButton) throw new Error("undo button not found");
    expect(undoButton.hasAttribute("disabled")).toBe(false);

    undoButton.dispatchEvent(new Event("click", { bubbles: true }));

    expect(root.querySelectorAll(".palette-editor__swatch").length).toBe(0);
  });

  it("mounts the state editor once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".state-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".state-editor")).not.toBeNull();
    });
  });

  it("mounts the animation editor once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".animation-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".animation-editor")).not.toBeNull();
    });
  });

  it("keeps the animation editor's sprite-existence check current after a sprite browser edit", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".animation-editor")).not.toBeNull();
    });

    root
      .querySelector<HTMLButtonElement>('[data-action="add-animation"]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-animation="0"] .animation-editor__animation-toggle',
      )
      ?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-animation="0"] [data-action="add-frame"]',
      )
      ?.click();
    // A freshly added frame defaults to sprite (0, 0), which exists in the
    // fixture `.sff` — no warning yet.
    expect(
      root.querySelector<HTMLElement>(".animation-editor__sprite-warning")
        ?.hidden,
    ).toBe(true);

    // Deleting that exact sprite via the sprite browser (same flow the
    // "reflects a sprite browser edit" test above exercises) should make
    // the animation editor's warning for it appear, proving the two stay
    // in sync through the shared spriteEdits overlay rather than each
    // reading a stale snapshot.
    root
      .querySelector<HTMLButtonElement>(".sprite-browser__group-toggle")
      ?.click();
    root
      .querySelectorAll<HTMLButtonElement>(".sprite-browser__sprite")[0]
      ?.click();
    root.querySelector<HTMLButtonElement>(".sprite-browser__delete")?.click();
    root
      .querySelector<HTMLButtonElement>(".sprite-browser__delete-confirm")
      ?.click();

    const warning = root.querySelector<HTMLElement>(
      ".animation-editor__sprite-warning",
    );
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("0, 0");
  });

  it("mounts the command editor once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".command-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".command-editor")).not.toBeNull();
    });
  });

  it("loads an existing .cmd file's commands into the shared document", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, [
      ...requiredFiles(),
      fileFromBytes("ryu.cmd", fixtureBytes("sample.cmd")),
    ]);

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".command-editor__row")).toHaveLength(2);
    });
    expect(getCharacterDocument()?.commandFile.commands).toEqual([
      { name: "a", input: "a", time: 1, bufferTime: 0 },
      { name: "QCF_a", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ]);
  });

  it("reflects a command editor edit in the shared document immediately", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".command-editor")).not.toBeNull();
    });

    root
      .querySelector<HTMLButtonElement>('[data-action="add-command"]')
      ?.click();
    const row = root.querySelector<HTMLElement>(".command-editor__row");
    if (!row) throw new Error("command row not found");
    const nameInput = row.querySelector<HTMLInputElement>(
      'input[data-field="name"]',
    );
    if (!nameInput) throw new Error("name input not found");
    nameInput.value = "NewCommand";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    nameInput.dispatchEvent(new Event("blur", { bubbles: true }));
    const inputInput = row.querySelector<HTMLInputElement>(
      'input[data-field="input"]',
    );
    if (!inputInput) throw new Error("input field not found");
    inputInput.value = "a";
    inputInput.dispatchEvent(new Event("input", { bubbles: true }));
    inputInput.dispatchEvent(new Event("blur", { bubbles: true }));

    expect(getCharacterDocument()?.commandFile.commands).toEqual([
      { name: "NewCommand", input: "a", time: 0, bufferTime: 0 },
    ]);
  });

  it("mounts the export panel once a character loads, listing the def/air/cns files unchanged", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });

    expect(root.querySelector(".export-panel")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });
    const names = [...root.querySelectorAll(".export-panel__file-name")].map(
      (el) => el.textContent,
    );
    expect(names).toEqual([
      "character.def (unchanged)",
      "character.air (unchanged)",
      "character.cns (unchanged)",
    ]);
  });

  describe("localization (backlog item 012)", () => {
    afterEach(() => {
      window.localStorage.clear();
    });

    it("renders a language switcher in the toolbar", () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0");

      const switcher = root.querySelector("wuik-locale-switcher");
      expect(switcher).not.toBeNull();
      expect(switcher?.getAttribute("label")).toBe("Language");
    });

    it("retranslates the toolbar's title, indicator and buttons in place when the locale changes, without resetting the loaded character", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0", { bridgeOptions });
      const dropZone = root.querySelector(".file-input__dropzone");
      if (!dropZone) throw new Error("dropzone not found");
      dispatchDrop(dropZone, requiredFiles());
      await vi.waitFor(() => {
        expect(root.querySelector(".characteristics-editor")).not.toBeNull();
      });

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(
        root.querySelector("wuik-locale-switcher")?.getAttribute("label"),
      ).toBe("Langue");
      expect(root.querySelector('[slot="toolbar"]')?.textContent).toContain(
        "Character Editor — v0.1.0",
      );
      expect(
        root.querySelector<HTMLElement>('[data-action="undo"]')?.textContent,
      ).toBe("Annuler");
      expect(
        root.querySelector<HTMLElement>('[data-action="redo"]')?.textContent,
      ).toBe("Rétablir");
      // The already-loaded character survives the locale switch untouched.
      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
      expect(
        root.querySelector<HTMLInputElement>('[data-field="name"]')?.value,
      ).toBe("Main Wiring Test Character");

      await getI18n()?.changeLanguage("en");
    });

    it("sets the document's lang attribute to the resolved locale", async () => {
      const root = document.createElement("div");
      renderApp(root, "0.1.0", "0.13.0");

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");
      expect(document.documentElement.lang).toBe("fr");

      await getI18n()?.changeLanguage("en");
      expect(document.documentElement.lang).toBe("en");
    });
  });
});
