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

/** Simulates typing into a `<wuik-text-input>` (backlog item 013) -- it reports every keystroke live via `wuik-input`, never a native "input" event. See .vibe/decisions/019. */
function typeIntoTextInput(el: Element, value: string): void {
  el.dispatchEvent(new CustomEvent("wuik-input", { detail: { value } }));
}

/** Simulates leaving a `<wuik-text-input>` (edited or not) -- `focusout` is the one event that still crosses its shadow boundary, unlike the native, uncomposed `blur` this app used to listen to directly. See .vibe/decisions/019. */
function leaveTextInput(el: Element): void {
  el.dispatchEvent(new Event("focusout", { bubbles: true, composed: true }));
}

function defText(name: string, extra = ""): string {
  return `[Info]\nname = ${name}\n\n[Files]\nsprite = ryu.sff\nanim = ryu.air\ncns = ryu.cns\n${extra}`;
}

function requiredFiles(): File[] {
  return [
    fileFromBytes("ryu.def", textBytes(defText("Main Wiring Test Character"))),
    fileFromBytes("ryu.air", fixtureBytes("sample.air")),
    fileFromBytes("ryu.sff", fixtureBytes("v1-basic.sff")),
    fileFromBytes("ryu.cns", fixtureBytes("sample.cns")),
  ];
}

/** Same as `requiredFiles`, but the `.def` also references a `.cmd` file. */
function requiredFilesWithCmdReference(): File[] {
  return [
    fileFromBytes(
      "ryu.def",
      textBytes(defText("Main Wiring Test Character", "cmd = ryu.cmd\n")),
    ),
    ...requiredFiles().slice(1),
    fileFromBytes("ryu.cmd", fixtureBytes("sample.cmd")),
  ];
}

/**
 * Simulates dropping a folder: builds a `DataTransfer`-like object whose
 * `items` yield one flat `FileSystemFileEntry`-like per file — matching
 * `character-file-input-view.ts`'s real drag-and-drop gathering contract
 * (`folder-entries.ts`'s `filesFromDataTransferItems`), not the old
 * per-file `dataTransfer.files` shape item 014 replaced.
 */
function dispatchDrop(dropZone: Element, files: File[]): void {
  const dataTransfer = {
    items: files.map((file) => ({
      webkitGetAsEntry: () => ({
        isFile: true,
        isDirectory: false,
        fullPath: `/${file.name}`,
        file: (success: (file: File) => void) => success(file),
      }),
    })),
  } as unknown as DataTransfer;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  // A real drop lands on the kit zone's inner element, inside its shadow root.
  (
    dropZone.shadowRoot?.querySelector('[role="button"]') ?? dropZone
  ).dispatchEvent(event);
}

/** A drop is handled at the window, so the app must be in the document. */
function newRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

function section(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-section="${id}"]`);
  if (!el) throw new Error(`section ${id} not found`);
  return el;
}

function visibleSections(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-section]")]
    .filter((el) => !el.hidden)
    .map((el) => el.dataset.section ?? "");
}

function navigateTo(root: HTMLElement, id: string): void {
  root.querySelector("wuik-sidebar-nav")?.dispatchEvent(
    new CustomEvent("wuik-navigate", {
      detail: { value: id },
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function loadCharacter(
  root: HTMLElement,
  files: File[] = requiredFiles(),
): Promise<void> {
  const dropZone = root.querySelector(".file-input__dropzone");
  if (!dropZone) throw new Error("dropzone not found");
  dispatchDrop(dropZone, files);
  await vi.waitFor(() => {
    expect(getCharacterDocument()).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".shell")?.hidden).toBe(false);
  });
}

describe("renderApp", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    resetWasmBridgeForTests();
    resetCharacterDocumentForTests();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts on the home screen, with no shell, and a toolbar showing the title and version once the shell is built", () => {
    const root = newRoot();

    renderApp(root, "0.1.0", "0.17.0");

    expect(root.querySelector<HTMLElement>(".home")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".shell")?.hidden).toBe(true);
    expect(root.querySelector(".home h1")?.textContent).toBe(
      "Character Editor",
    );
    expect(root.querySelector(".shell__toolbar")?.textContent).toContain(
      "Character Editor — v0.1.0",
    );
  });

  it("offers the language and theme controls on the home screen, and nothing else in its chrome", () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0");

    const chrome = root.querySelector(".home__chrome");
    expect(chrome?.querySelector("wuik-locale-switcher")).not.toBeNull();
    expect(
      chrome?.querySelector('[data-action="theme-toggle"]'),
    ).not.toBeNull();
    expect(chrome?.querySelectorAll("wuik-button")).toHaveLength(1);
  });

  it("toggles the page theme from the kit's dark default to light, then back, when the theme button is activated", () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0");

    const toggle = root.querySelector<HTMLElement>(
      '.shell [data-action="theme-toggle"]',
    );
    if (!toggle) throw new Error("theme toggle not found");
    expect(toggle.textContent).toBe("Switch to light mode");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle.textContent).toBe("Switch to dark mode");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(toggle.textContent).toBe("Switch to light mode");
  });

  it("replaces previous content instead of appending on repeated renders", () => {
    const root = newRoot();

    renderApp(root, "0.1.0", "0.17.0");
    renderApp(root, "0.2.0", "0.17.0");

    expect(root.querySelectorAll(".shell")).toHaveLength(1);
    expect(root.querySelectorAll(".home")).toHaveLength(1);
    expect(root.querySelector(".shell__toolbar")?.textContent).toContain(
      "Character Editor — v0.2.0",
    );
  });

  it("shows a clear, announced error instead of an unstyled shell when web-ui-kit is too old", () => {
    const root = newRoot();

    renderApp(root, "0.1.0", "0.3.0");

    expect(root.querySelector(".shell")).toBeNull();
    const alert = root.querySelector('.web-ui-kit-version-error[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("aria-live")).toBe("assertive");
    expect(alert?.textContent).toContain(MIN_SUPPORTED_WEB_UI_KIT_VERSION);
    expect(alert?.textContent).toContain("0.3.0");
  });

  it("replaces a previously rendered error state once a supported version is given", () => {
    const root = newRoot();

    renderApp(root, "0.1.0", "0.3.0");
    renderApp(root, "0.1.0", "0.17.0");

    expect(
      root.querySelector('.web-ui-kit-version-error[role="alert"]'),
    ).toBeNull();
    expect(root.querySelector(".shell")).not.toBeNull();
  });

  it("mounts the character file input into the home screen", () => {
    const root = newRoot();

    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    expect(dropZone).not.toBeNull();
  });

  describe("new-character wizard (backlog item 010)", () => {
    it("mounts a New Character trigger alongside the file input", () => {
      const root = newRoot();

      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      expect(root.querySelector('[data-action="open-wizard"]')).not.toBeNull();
      expect(root.querySelector('[data-action="open-folder"]')).not.toBeNull();
    });

    it("creates a valid blank character through the wizard and wires it up exactly like an import", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      root.querySelector<HTMLElement>('[data-action="open-wizard"]')?.click();
      const nameField = root.querySelector<HTMLElement>(
        '[data-field="wizard-name"]',
      );
      if (!nameField) throw new Error("wizard name field not found");
      typeIntoTextInput(nameField, "Wizard Fighter");

      root
        .querySelector<HTMLElement>('[data-action="create-character"]')
        ?.click();

      await vi.waitFor(() => {
        expect(root.querySelector(".characteristics-editor")).not.toBeNull();
      });
      expect(getCharacterDocument()?.character.name).toBe("Wizard Fighter");
      expect(
        root
          .querySelector<HTMLElement>('[data-field="name"]')
          ?.getAttribute("value"),
      ).toBe("Wizard Fighter");
      // The dialog closes once the character is created.
      expect(
        root
          .querySelector(".new-character-wizard__dialog")
          ?.hasAttribute("open"),
      ).toBe(false);
    });

    it("creates a basic-template character with real content in the state and animation editors", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      root.querySelector<HTMLElement>('[data-action="open-wizard"]')?.click();
      root
        .querySelector(".new-character-wizard__template")
        ?.dispatchEvent(
          new CustomEvent("wuik-change", { detail: { value: "basic" } }),
        );
      const nameField = root.querySelector<HTMLElement>(
        '[data-field="wizard-name"]',
      );
      if (!nameField) throw new Error("wizard name field not found");
      typeIntoTextInput(nameField, "Templated Fighter");

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
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

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
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".characteristics-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".characteristics-editor")).not.toBeNull();
    });
    const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
    expect(nameInput?.getAttribute("value")).toBe("Main Wiring Test Character");
  });

  it("reflects a characteristics-editor edit in the in-memory document immediately", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());
    await vi.waitFor(() => {
      expect(root.querySelector(".characteristics-editor")).not.toBeNull();
    });

    const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
    if (!nameInput) throw new Error("name field not found");
    typeIntoTextInput(nameInput, "Renamed");

    expect(getCharacterDocument()?.character.name).toBe("Renamed");
  });

  describe("undo/redo (backlog item 010)", () => {
    async function loadAndRename(root: HTMLElement): Promise<HTMLElement> {
      const dropZone = root.querySelector(".file-input__dropzone");
      if (!dropZone) throw new Error("dropzone not found");
      dispatchDrop(dropZone, requiredFiles());
      await vi.waitFor(() => {
        expect(root.querySelector(".characteristics-editor")).not.toBeNull();
      });
      const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
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
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      expect(requireButton(root, "undo").hasAttribute("disabled")).toBe(true);
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(true);
    });

    it("enables Undo after an edit, reverts the edit and enables Redo when Undo is clicked", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      typeIntoTextInput(nameInput, "Renamed");

      expect(requireButton(root, "undo").hasAttribute("disabled")).toBe(false);

      requireButton(root, "undo").dispatchEvent(
        new Event("click", { bubbles: true }),
      );

      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
      expect(requireButton(root, "redo").hasAttribute("disabled")).toBe(false);
      const nameInputAfterUndo = root.querySelector<HTMLElement>(
        '[data-field="name"]',
      );
      if (!nameInputAfterUndo) throw new Error("name field not found");
      expect(nameInputAfterUndo.getAttribute("value")).toBe(
        "Main Wiring Test Character",
      );
    });

    it("re-applies the edit when Redo is clicked after an Undo", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      typeIntoTextInput(nameInput, "Renamed");
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
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

      const nameInput = await loadAndRename(root);
      typeIntoTextInput(nameInput, "Renamed");

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
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
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
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      expect(isDirty()).toBe(false);
      expect(root.querySelector(".app-unsaved-indicator")?.textContent).toBe(
        "",
      );

      const nameInput = await loadAndRename(root);
      typeIntoTextInput(nameInput, "Renamed");

      expect(isDirty()).toBe(true);
      expect(
        root.querySelector(".app-unsaved-indicator")?.textContent,
      ).not.toBe("");
    });

    it("keeps the shared history usable directly, not just through the toolbar buttons", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      const nameInput = await loadAndRename(root);
      typeIntoTextInput(nameInput, "Renamed");

      expect(getAppHistory().canUndo).toBe(true);
    });
  });

  it("mounts the sprite browser once a character loads successfully", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".sprite-browser")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".sprite-browser")).not.toBeNull();
    });
  });

  it("reflects a sprite browser edit in the in-memory document's spriteEdits", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

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
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".palette-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".palette-editor")).not.toBeNull();
    });
  });

  it("undoes a palette-editor edit through the shared toolbar Undo button, not just the palette editor's own history", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

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
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".state-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".state-editor")).not.toBeNull();
    });
  });

  it("mounts the animation editor once a character loads successfully", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".animation-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".animation-editor")).not.toBeNull();
    });
  });

  it("keeps the animation editor's sprite-existence check current after a sprite browser edit", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

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
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    expect(root.querySelector(".command-editor")).toBeNull();

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => {
      expect(root.querySelector(".command-editor")).not.toBeNull();
    });
  });

  it("loads an existing .cmd file's commands into the shared document", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFilesWithCmdReference());

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".command-editor__row")).toHaveLength(2);
    });
    expect(getCharacterDocument()?.commandFile.commands).toEqual([
      { name: "a", input: "a", time: 1, bufferTime: 0 },
      { name: "QCF_a", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ]);
  });

  it("reflects a command editor edit in the shared document immediately", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });

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
    const nameInput = row.querySelector<HTMLElement>(
      'wuik-text-input[data-field="name"]',
    );
    if (!nameInput) throw new Error("name input not found");
    typeIntoTextInput(nameInput, "NewCommand");
    leaveTextInput(nameInput);
    const inputInput = row.querySelector<HTMLElement>(
      'wuik-text-input[data-field="input"]',
    );
    if (!inputInput) throw new Error("input field not found");
    typeIntoTextInput(inputInput, "a");
    leaveTextInput(inputInput);

    expect(getCharacterDocument()?.commandFile.commands).toEqual([
      { name: "NewCommand", input: "a", time: 0, bufferTime: 0 },
    ]);
  });

  it("lists the def/air/cns files unchanged in the Export section once a character loads", async () => {
    const root = newRoot();
    renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
    await loadCharacter(root);

    navigateTo(root, "output");

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".output-section__file")).toHaveLength(3);
    });
    const names = [...root.querySelectorAll(".output-section__file span")].map(
      (el) => el.textContent,
    );
    expect(names).toEqual([
      "character.def (unchanged)",
      "ryu.air (unchanged)",
      "ryu.cns (unchanged)",
    ]);
  });

  describe("localization (backlog item 012)", () => {
    afterEach(() => {
      window.localStorage.clear();
    });

    it("renders a language switcher in the toolbar", () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0");

      const switcher = root.querySelector("wuik-locale-switcher");
      expect(switcher).not.toBeNull();
      expect(switcher?.getAttribute("label")).toBe("Language");
    });

    it("retranslates the toolbar's title, indicator and buttons in place when the locale changes, without resetting the loaded character", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
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
      expect(root.querySelector(".shell__toolbar")?.textContent).toContain(
        "Character Editor — v0.1.0",
      );
      expect(
        root.querySelector<HTMLElement>('.shell [data-action="undo"]')
          ?.textContent,
      ).toBe("Annuler");
      expect(
        root.querySelector<HTMLElement>('.shell [data-action="redo"]')
          ?.textContent,
      ).toBe("Rétablir");
      // The already-loaded character survives the locale switch untouched.
      expect(getCharacterDocument()?.character.name).toBe(
        "Main Wiring Test Character",
      );
      expect(
        root
          .querySelector<HTMLElement>('[data-field="name"]')
          ?.getAttribute("value"),
      ).toBe("Main Wiring Test Character");

      await getI18n()?.changeLanguage("en");
    });

    it("sets the document's lang attribute to the resolved locale", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0");

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");
      expect(document.documentElement.lang).toBe("fr");

      await getI18n()?.changeLanguage("en");
      expect(document.documentElement.lang).toBe("en");
    });
  });

  describe("application shell (UX flow 001)", () => {
    function pressKey(init: KeyboardEventInit): KeyboardEvent {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        ...init,
      });
      window.dispatchEvent(event);
      return event;
    }

    function navItem(root: HTMLElement, id: string): HTMLElement {
      const item = root.querySelector<HTMLElement>(
        `wuik-nav-item[value="${id}"]`,
      );
      if (!item) throw new Error(`nav item ${id} not found`);
      return item;
    }

    it("opens on Identity once a character loads, hiding the home screen and showing only that section", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);

      expect(root.querySelector<HTMLElement>(".home")?.hidden).toBe(true);
      expect(visibleSections(root)).toEqual(["identity"]);
      expect(
        root.querySelector("wuik-sidebar-nav")?.getAttribute("label"),
      ).toBe("Sections");
      expect(document.title).toBe("Identity — Character Editor");
    });

    it("shows one section at a time when navigating, and keeps the other sections mounted with their state", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);
      const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
      if (!nameInput) throw new Error("name field not found");

      navigateTo(root, "commands");

      expect(visibleSections(root)).toEqual(["commands"]);
      expect(document.title).toBe("Commands — Character Editor");
      expect(section(root, "identity").contains(nameInput)).toBe(true);
      expect(root.querySelector('[data-field="name"]')).toBe(nameInput);
    });

    it("goes to a section with Alt+digit read from the key code, and ignores it with a dialog open", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);

      pressKey({ altKey: true, code: "Digit5", key: "%" });
      expect(visibleSections(root)).toEqual(["states"]);

      const dialog = document.createElement("wuik-dialog");
      dialog.setAttribute("open", "");
      document.body.appendChild(dialog);
      pressKey({ altKey: true, code: "Digit2" });
      expect(visibleSections(root)).toEqual(["states"]);
    });

    it("does not react to Alt+digit on the home screen", () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      pressKey({ altKey: true, code: "Digit2" });
      expect(root.querySelector<HTMLElement>(".home")?.hidden).toBe(false);
    });

    it("opens the help dialog with ? and not while typing in a field", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);
      const help = root.querySelector("wuik-dialog.help-dialog");

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "?",
          bubbles: true,
          composed: true,
        }),
      );
      expect(help?.hasAttribute("open")).toBe(false);

      pressKey({ key: "?" });
      expect(help?.hasAttribute("open")).toBe(true);
    });

    it("shows no badge before the first validation and none for a clean character", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      expect(navItem(root, "identity").hasAttribute("badge-error")).toBe(false);

      await loadCharacter(root);

      for (const id of ["identity", "commands", "states", "animations"]) {
        expect(navItem(root, id).hasAttribute("badge-error")).toBe(false);
      }
    });

    function namelessFiles(): File[] {
      return [
        fileFromBytes("ryu.def", textBytes(defText(""))),
        ...requiredFiles().slice(1),
      ];
    }

    it("puts an error badge on Identity for a nameless imported character, and clears it once the name is filled in", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root, namelessFiles());

      const item = navItem(root, "identity");
      expect(item.getAttribute("badge-error")).toBe("1");
      expect(item.getAttribute("badge-label")).toBe("1 error, 1 warning");

      const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
      if (!nameInput) throw new Error("name field not found");
      typeIntoTextInput(nameInput, "Fixed");
      expect(navItem(root, "identity").hasAttribute("badge-error")).toBe(false);

      root.querySelector<HTMLElement>('.shell [data-action="undo"]')?.click();
      expect(navItem(root, "identity").getAttribute("badge-error")).toBe("1");
    });

    it("opens the Export section with the problem list instead of exporting when there are errors", async () => {
      const root = newRoot();
      const triggerDownload = vi.fn();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions, triggerDownload });
      await loadCharacter(root, namelessFiles());

      root.querySelector<HTMLElement>('[data-action="download-all"]')?.click();

      expect(visibleSections(root)).toEqual(["output"]);
      expect(root.querySelectorAll("[data-issue]").length).toBeGreaterThan(0);
      expect(triggerDownload).not.toHaveBeenCalled();
    });

    it("exports every file with progress, then shows a persistent saved status and clears the modified indicator", async () => {
      const root = newRoot();
      const triggerDownload = vi.fn();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions, triggerDownload });
      await loadCharacter(root);
      const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
      if (!nameInput) throw new Error("name field not found");
      typeIntoTextInput(nameInput, "Edited");
      expect(isDirty()).toBe(true);

      const exportButton = root.querySelector<HTMLElement>(
        '[data-action="download-all"]',
      );
      exportButton?.click();
      exportButton?.click();

      await vi.waitFor(
        () => {
          expect(
            root.querySelector(".shell__save-status")?.textContent,
          ).toMatch(/^Saved at \d{1,2}:\d{2}/);
        },
        { timeout: 3000 },
      );
      expect(triggerDownload).toHaveBeenCalledTimes(3);
      expect(isDirty()).toBe(false);
      expect(root.querySelector(".app-unsaved-indicator")?.textContent).toBe(
        "",
      );
    });

    it("navigates to the section an Undo touched and announces what was undone", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const root = newRoot();
        renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
        await vi.waitFor(() => {}, { timeout: 0 }).catch(() => {});
        vi.useRealTimers();
        await loadCharacter(root);
        const nameInput = root.querySelector<HTMLElement>(
          '[data-field="name"]',
        );
        if (!nameInput) throw new Error("name field not found");
        typeIntoTextInput(nameInput, "Renamed");
        navigateTo(root, "commands");
        expect(visibleSections(root)).toEqual(["commands"]);

        root.querySelector<HTMLElement>('.shell [data-action="undo"]')?.click();

        expect(visibleSections(root)).toEqual(["identity"]);
        await vi.waitFor(() => {
          expect(
            root.querySelector('.shell__live[role="status"]')?.textContent,
          ).toBe("Undone: identity change");
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("leaves directly for the home screen when nothing is modified", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);

      root.querySelector<HTMLElement>('[data-action="open-another"]')?.click();

      await vi.waitFor(() => {
        expect(root.querySelector<HTMLElement>(".home")?.hidden).toBe(false);
      });
      expect(root.querySelector<HTMLElement>(".shell")?.hidden).toBe(true);
      expect(getCharacterDocument()).toBeNull();
    });

    it("asks before leaving a modified character; Cancel keeps it, Discard goes home", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);
      const nameInput = root.querySelector<HTMLElement>('[data-field="name"]');
      if (!nameInput) throw new Error("name field not found");
      typeIntoTextInput(nameInput, "Edited");

      const leave = root.querySelector("wuik-dialog.leave-dialog");
      root.querySelector<HTMLElement>('[data-action="open-another"]')?.click();
      expect(leave?.hasAttribute("open")).toBe(true);

      root.querySelector<HTMLElement>('[data-action="leave-cancel"]')?.click();
      expect(leave?.hasAttribute("open")).toBe(false);
      expect(root.querySelector<HTMLElement>(".shell")?.hidden).toBe(false);
      expect(getCharacterDocument()).not.toBeNull();

      root.querySelector<HTMLElement>('[data-action="open-another"]')?.click();
      root.querySelector<HTMLElement>('[data-action="leave-discard"]')?.click();
      await vi.waitFor(() => {
        expect(root.querySelector<HTMLElement>(".home")?.hidden).toBe(false);
      });
      expect(getCharacterDocument()).toBeNull();
    });

    it("ignores a folder dropped while a character is open instead of replacing it", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      await loadCharacter(root);
      const before = getCharacterDocument();

      dispatchDrop(document.body, requiredFiles());
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getCharacterDocument()).toBe(before);
    });

    it("keeps the sidebar fold choice in localStorage and tolerates storage being unavailable", async () => {
      const root = newRoot();
      renderApp(root, "0.1.0", "0.17.0", { bridgeOptions });
      const fold = root.querySelector<HTMLElement>(
        '[data-action="fold-sidebar"]',
      );
      fold?.click();
      expect(
        window.localStorage.getItem("character-editor-sidebar-collapsed"),
      ).toBe("1");
      expect(
        root.querySelector("wuik-sidebar-nav")?.hasAttribute("collapsed"),
      ).toBe(true);
      expect(fold?.getAttribute("aria-expanded")).toBe("false");

      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });
      expect(() => fold?.click()).not.toThrow();
      expect(
        root.querySelector("wuik-sidebar-nav")?.hasAttribute("collapsed"),
      ).toBe(false);
      spy.mockRestore();
      window.localStorage.clear();
    });
  });
});
