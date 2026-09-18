import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { renderCharacterFileInput } from "./character-file-input-view.ts";
import type { EntryLike, FileEntryLike } from "./folder-entries.ts";

const publicWasmDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
);
const testOptions: WasmBridgeOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
};

const testdataDir = path.resolve(import.meta.dirname, "..", "wasm", "testdata");
function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

function defText(name = "File Input Test Character", basename = "ryu"): string {
  return `[Info]\nname = ${name}\n\n[Files]\nsprite = ${basename}.sff\nanim = ${basename}.air\ncns = ${basename}.cns\n`;
}

function makeFile(name: string, contents: BlobPart | Uint8Array = "x"): File {
  return new File([contents as BufferSource], name);
}

function withRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

function fakeFileEntry(fullPath: string, file: File): FileEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    fullPath,
    file: (success) => success(file),
  };
}

/** jsdom's DragEvent does not implement DataTransfer, so it is stubbed directly. */
function dispatchDrop(target: Element, entries: (EntryLike | null)[]): void {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
    },
  });
  target.dispatchEvent(event);
}

function picker(root: HTMLElement): HTMLInputElement {
  return root.querySelector('input[type="file"]') as HTMLInputElement;
}

function status(root: HTMLElement): HTMLElement {
  return root.querySelector('[role="status"]') as HTMLElement;
}

function dropZone(root: HTMLElement): HTMLElement {
  return root.querySelector(".file-input__dropzone") as HTMLElement;
}

async function selectViaPicker(
  root: HTMLElement,
  files: File[],
): Promise<void> {
  const input = picker(root);
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => {
    if (status(root).textContent?.toLowerCase().includes("reading")) {
      throw new Error("still loading");
    }
  });
}

function requiredFolderFiles(name?: string): File[] {
  return [
    withRelativePath(makeFile("ryu.def", defText(name)), "ryu/ryu.def"),
    withRelativePath(
      makeFile("ryu.air", fixtureBytes("sample.air")),
      "ryu/ryu.air",
    ),
    withRelativePath(
      makeFile("ryu.sff", fixtureBytes("v1-basic.sff")),
      "ryu/ryu.sff",
    ),
    withRelativePath(
      makeFile("ryu.cns", fixtureBytes("sample.cns")),
      "ryu/ryu.cns",
    ),
  ];
}

describe("renderCharacterFileInput", () => {
  beforeEach(() => {
    resetWasmBridgeForTests();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a folder-specific prompt in the idle state, not the old per-file prompt", () => {
    const root = document.createElement("div");
    renderCharacterFileInput(root, { onLoaded: vi.fn() });

    expect(root.querySelector(".file-input__label")?.textContent).toContain(
      "folder",
    );
    expect(root.querySelectorAll(".file-input__slot")).toHaveLength(0);
  });

  it("auto-loads and calls onLoaded once a folder picked via the folder input resolves completely", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    await selectViaPicker(root, requiredFolderFiles("Picker Test Character"));

    expect(onLoaded).toHaveBeenCalledTimes(1);
    const [character] = onLoaded.mock.calls[0] as [CharacterData, unknown];
    expect(character.name).toBe("Picker Test Character");
    expect(status(root).textContent).toContain("Picker Test Character");
  });

  it("gathers a dropped folder's contents and loads the character the same way as the picker", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    dispatchDrop(dropZone(root), [
      fakeFileEntry(
        "/ryu/ryu.def",
        makeFile("ryu.def", defText("Dropped Character")),
      ),
      fakeFileEntry(
        "/ryu/ryu.air",
        makeFile("ryu.air", fixtureBytes("sample.air")),
      ),
      fakeFileEntry(
        "/ryu/ryu.sff",
        makeFile("ryu.sff", fixtureBytes("v1-basic.sff")),
      ),
      fakeFileEntry(
        "/ryu/ryu.cns",
        makeFile("ryu.cns", fixtureBytes("sample.cns")),
      ),
    ]);

    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
  });

  it("shows a picker naming both candidates when the folder has two .def files, and loads the one confirmed", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const defA = withRelativePath(
      makeFile("ryu.def", defText("Ryu", "ryu")),
      "ryu/ryu.def",
    );
    const defB = withRelativePath(
      makeFile("ken.def", defText("Ken", "ken")),
      "ken/ken.def",
    );
    await selectViaPicker(root, [
      defA,
      defB,
      ...requiredFolderFiles().slice(1),
      withRelativePath(
        makeFile("ken.air", fixtureBytes("sample.air")),
        "ken/ken.air",
      ),
      withRelativePath(
        makeFile("ken.sff", fixtureBytes("v1-basic.sff")),
        "ken/ken.sff",
      ),
      withRelativePath(
        makeFile("ken.cns", fixtureBytes("sample.cns")),
        "ken/ken.cns",
      ),
    ]);

    const options = Array.from(
      root.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );
    expect(options).toHaveLength(2);
    expect(root.textContent).toContain("ryu/ryu.def");
    expect(root.textContent).toContain("ken/ken.def");

    const confirmButton = root.querySelector<HTMLButtonElement>(
      '[data-action="confirm-selection"]',
    );
    expect(confirmButton?.disabled).toBe(true);

    options[0].checked = true;
    options[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(confirmButton?.disabled).toBe(false);

    confirmButton?.dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    const [character] = onLoaded.mock.calls[0] as [CharacterData, unknown];
    expect(character.name).toBe("Ryu");
  });

  it("shows a clear error naming the missing referenced file, without calling onLoaded, when a required file can't be found", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const files = requiredFolderFiles().filter((f) => !f.name.endsWith(".sff"));
    await selectViaPicker(root, files);

    expect(onLoaded).not.toHaveBeenCalled();
    expect(status(root).textContent).toContain("ryu.sff");
    expect(status(root).classList.contains("file-input__status--error")).toBe(
      true,
    );
  });

  it("reports no .def file found, without calling onLoaded, for a folder with none", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    await selectViaPicker(root, [
      withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
    ]);

    expect(onLoaded).not.toHaveBeenCalled();
    expect(status(root).textContent).toContain(".def");
  });

  it("still calls onLoaded, noting the ambiguity in the status, when the folder has two .zss files", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    await selectViaPicker(root, [
      ...requiredFolderFiles("Zss Ambiguous Character"),
      withRelativePath(makeFile("ryu.zss", "1"), "ryu/ryu.zss"),
      withRelativePath(makeFile("ryu-alt.zss", "2"), "ryu/ryu-alt.zss"),
    ]);

    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(status(root).textContent).toContain("2");
  });

  it("lets the user choose a different folder after an error, clearing the previous error", async () => {
    const root = document.createElement("div");
    renderCharacterFileInput(root, {
      onLoaded: vi.fn(),
      bridgeOptions: testOptions,
    });

    await selectViaPicker(root, [
      withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
    ]);
    expect(status(root).classList.contains("file-input__status--error")).toBe(
      true,
    );

    const resetButton = root.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    resetButton?.dispatchEvent(new Event("click", { bubbles: true }));

    expect(status(root).textContent).toBe("");
    expect(status(root).classList.contains("file-input__status--error")).toBe(
      false,
    );
  });

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("retranslates the static label/hint and an already-shown error in place, without re-running the load", async () => {
      const root = document.createElement("div");
      renderCharacterFileInput(root, {
        onLoaded: vi.fn(),
        bridgeOptions: testOptions,
      });

      await selectViaPicker(root, [
        withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
      ]);
      expect(status(root).textContent).toContain(".def");

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector(".file-input__label")?.textContent).toContain(
        "dossier",
      );
      expect(status(root).textContent).toContain(".def");
      expect(status(root).textContent?.toLowerCase()).toContain("trouv");
    });
  });
});
