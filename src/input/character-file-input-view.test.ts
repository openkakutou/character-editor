import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { renderCharacterFileInput } from "./character-file-input-view.ts";
import { readFileAsBytes } from "./character-file-input.ts";
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
  // A real drop lands on the kit zone's inner element, inside its shadow root.
  (target.shadowRoot?.querySelector('[role="button"]') ?? target).dispatchEvent(
    event,
  );
}

function picker(root: HTMLElement): HTMLInputElement {
  return root.querySelector('input[type="file"]') as HTMLInputElement;
}

function status(root: HTMLElement): HTMLElement {
  return root.querySelector('[role="status"]') as HTMLElement;
}

function errorBlock(root: HTMLElement): HTMLElement {
  return root.querySelector(".file-input__error") as HTMLElement;
}

// A drop is handled at the window, so the view must be in the document.
function dropZone(root: HTMLElement): HTMLElement {
  if (!root.isConnected) document.body.appendChild(root);
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
    if (input.disabled) throw new Error("still loading");
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

function validFolderEntries(name: string): FileEntryLike[] {
  return [
    fakeFileEntry("/p/p.def", makeFile("p.def", defText(name, "p"))),
    fakeFileEntry("/p/p.air", makeFile("p.air", fixtureBytes("sample.air"))),
    fakeFileEntry("/p/p.sff", makeFile("p.sff", fixtureBytes("v1-basic.sff"))),
    fakeFileEntry("/p/p.cns", makeFile("p.cns", fixtureBytes("sample.cns"))),
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
    expect(errorBlock(root).hidden).toBe(false);
    expect(errorBlock(root).textContent).toContain("ryu.sff");
  });

  it("reports no .def file found, without calling onLoaded, for a folder with none", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    await selectViaPicker(root, [
      withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
    ]);

    expect(onLoaded).not.toHaveBeenCalled();
    expect(errorBlock(root).textContent).toContain(".def");
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
    expect(errorBlock(root).hidden).toBe(false);

    const resetButton = root.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    resetButton?.dispatchEvent(new Event("click", { bubbles: true }));

    expect(status(root).textContent).toBe("");
    expect(errorBlock(root).hidden).toBe(true);
  });

  describe("opening a folder from the kit drop zone", () => {
    it("puts the kit drop zone in folder mode", () => {
      const root = document.createElement("div");
      renderCharacterFileInput(root, { onLoaded: vi.fn() });

      expect(dropZone(root).hasAttribute("directory")).toBe(true);
    });

    it("opens the folder picker from the Open folder button", () => {
      const root = document.createElement("div");
      renderCharacterFileInput(root, { onLoaded: vi.fn() });
      const clickSpy = vi.spyOn(picker(root), "click");

      root.querySelector<HTMLElement>('[data-action="open-folder"]')?.click();

      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it("loads a folder dropped anywhere on the window", async () => {
      const root = document.createElement("div");
      const onLoaded = vi.fn();
      renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });
      document.body.appendChild(root);

      dispatchDrop(document.body, validFolderEntries("Elsewhere"));

      await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    });

    it("swallows a drop without loading it while the view is inactive", async () => {
      const root = document.createElement("div");
      const onLoaded = vi.fn();
      renderCharacterFileInput(root, {
        onLoaded,
        bridgeOptions: testOptions,
        isActive: () => false,
      });
      document.body.appendChild(root);

      dispatchDrop(document.body, validFolderEntries("Ignored"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onLoaded).not.toHaveBeenCalled();
    });

    it("offers Retry only for a cause a second attempt can fix, and runs the same folder again", async () => {
      const root = document.createElement("div");
      const onLoaded = vi.fn();
      let failReads = true;
      renderCharacterFileInput(root, {
        onLoaded,
        bridgeOptions: {
          ...testOptions,
          readFileBytes: async (file) => {
            if (failReads) throw new Error("NotReadableError");
            return await readFileAsBytes(file);
          },
        },
      });
      const retry = () =>
        root.querySelector<HTMLElement>('[data-action="retry"]');
      expect(retry()?.hidden).toBe(true);

      await selectViaPicker(root, requiredFolderFiles("Retried Character"));
      expect(onLoaded).not.toHaveBeenCalled();
      expect(retry()?.hidden).toBe(false);

      failReads = false;
      retry()?.click();
      await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    });

    it("offers no Retry for a permanent cause such as a folder without a .def", async () => {
      const root = document.createElement("div");
      renderCharacterFileInput(root, {
        onLoaded: vi.fn(),
        bridgeOptions: testOptions,
      });
      await selectViaPicker(root, [
        withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
      ]);
      expect(
        root.querySelector<HTMLElement>('[data-action="retry"]')?.hidden,
      ).toBe(true);
      expect(
        root.querySelector<HTMLElement>('[data-action="reset"]')?.hidden,
      ).toBe(false);
    });
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
      expect(errorBlock(root).textContent).toContain(".def");

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector(".file-input__label")?.textContent).toContain(
        "dossier",
      );
      expect(errorBlock(root).textContent).toContain(".def");
      expect(errorBlock(root).textContent?.toLowerCase()).toContain("trouv");
    });
  });

  describe("robust loading (flow 002)", () => {
    afterEach(() => vi.useRealTimers());

    it("announces a failure once through onFailure, as a sentence without the raw text", async () => {
      const root = document.createElement("div");
      const onFailure = vi.fn();
      renderCharacterFileInput(root, {
        onLoaded: vi.fn(),
        onFailure,
        bridgeOptions: {
          ...testOptions,
          readFileBytes: async () => {
            throw new Error("NotReadableError: permission");
          },
        },
      });
      await selectViaPicker(root, requiredFolderFiles());

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure.mock.calls[0][0]).toContain("Couldn't open this folder");
      expect(onFailure.mock.calls[0][0]).not.toContain("NotReadableError");
      // The raw text lives only behind "Show details".
      const detail =
        errorBlock(root).querySelector<HTMLElement>(".problem__detail");
      expect(detail?.textContent).toBe("NotReadableError: permission");
      expect(detail?.hidden).toBe(true);
    });

    it("does not announce again when the language changes", async () => {
      const root = document.createElement("div");
      const onFailure = vi.fn();
      renderCharacterFileInput(root, {
        onLoaded: vi.fn(),
        onFailure,
        bridgeOptions: testOptions,
      });
      await selectViaPicker(root, [
        withRelativePath(makeFile("readme.txt"), "pack/readme.txt"),
      ]);
      await initAppI18n();
      await getI18n()?.changeLanguage("fr");
      expect(onFailure).toHaveBeenCalledTimes(1);
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("never leaves the picker disabled when the engine fails to start", async () => {
      const root = document.createElement("div");
      const onFailure = vi.fn();
      renderCharacterFileInput(root, {
        onLoaded: vi.fn(),
        onFailure,
        bridgeOptions: {
          fetchWasmExecSource: async () => {
            throw new Error("Failed to fetch");
          },
          fetchWasmBytes: async () => new Uint8Array(),
        },
      });
      await selectViaPicker(root, requiredFolderFiles());

      expect(picker(root).disabled).toBe(false);
      expect(errorBlock(root).textContent).toContain(
        "The editor engine didn't load",
      );
      expect(
        root.querySelector<HTMLElement>('[data-action="retry"]')?.hidden,
      ).toBe(false);
    });

    it("opens a character whose sprite sheet could not be read and reports the file", async () => {
      const root = document.createElement("div");
      const onLoaded = vi.fn();
      renderCharacterFileInput(root, {
        onLoaded,
        bridgeOptions: {
          ...testOptions,
          readFileBytes: async (file) => {
            if (file.name === "ryu.sff") throw new Error("NotReadableError");
            return await readFileAsBytes(file);
          },
          fetchBlankSffBytes: async () => fixtureBytes("v1-basic.sff"),
        },
      });
      await selectViaPicker(root, requiredFolderFiles("Partial Character"));

      expect(onLoaded).toHaveBeenCalledTimes(1);
      const [, , unreadable] = onLoaded.mock.calls[0];
      expect(unreadable).toEqual([
        { kind: "sff", fileName: "ryu.sff", detail: "NotReadableError" },
      ]);
    });

    it("shows the unsupported version instead of loading a sprite sheet from a newer format", async () => {
      const root = document.createElement("div");
      const onLoaded = vi.fn();
      const onFailure = vi.fn();
      const newer = new Uint8Array(fixtureBytes("v1-basic.sff"));
      newer[15] = 3;
      renderCharacterFileInput(root, {
        onLoaded,
        onFailure,
        bridgeOptions: {
          ...testOptions,
          readFileBytes: async (file) =>
            file.name === "ryu.sff" ? newer : await readFileAsBytes(file),
        },
      });
      await selectViaPicker(root, requiredFolderFiles());

      expect(onLoaded).not.toHaveBeenCalled();
      expect(errorBlock(root).textContent).toContain(
        "ryu.sff uses version 3.0.1.0",
      );
      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    describe("progress and cancel", () => {
      function slowReads(release: {
        current: () => void;
      }): WasmBridgeOptions & {
        readFileBytes: (file: File) => Promise<Uint8Array>;
      } {
        const gate = new Promise<void>((resolve) => {
          release.current = resolve;
        });
        return {
          ...testOptions,
          readFileBytes: async (file) => {
            await gate;
            return await readFileAsBytes(file);
          },
        };
      }

      function startLoad(root: HTMLElement, files: File[]): void {
        const input = picker(root);
        Object.defineProperty(input, "files", {
          value: files,
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      it("shows named steps with a status word after a short delay, and Cancel", async () => {
        vi.useFakeTimers();
        const root = document.createElement("div");
        const release = { current: () => {} };
        renderCharacterFileInput(root, {
          onLoaded: vi.fn(),
          bridgeOptions: slowReads(release),
        });
        const progress = root.querySelector<HTMLElement>(
          ".file-input__progress",
        ) as HTMLElement;
        startLoad(root, requiredFolderFiles());
        expect(progress.hidden).toBe(true);

        vi.advanceTimersByTime(350);
        expect(progress.hidden).toBe(false);
        expect(progress.getAttribute("aria-busy")).toBe("true");
        const steps = [...progress.querySelectorAll("li")].map(
          (li) => li.textContent,
        );
        expect(steps[0]).toBe("Reading the folder — Done");
        expect(steps[1]).toBe("Finding the character file — In progress");
        expect(steps[4]).toBe("Opening the character — Waiting");
        expect(
          root.querySelector('[data-action="cancel-load"]'),
        ).not.toBeNull();
        expect(
          root
            .querySelector('[data-action="open-folder"]')
            ?.getAttribute("aria-disabled"),
        ).toBe("true");
      });

      it("says it is still working after ten seconds", async () => {
        vi.useFakeTimers();
        const root = document.createElement("div");
        const release = { current: () => {} };
        renderCharacterFileInput(root, {
          onLoaded: vi.fn(),
          bridgeOptions: slowReads(release),
        });
        startLoad(root, requiredFolderFiles());
        vi.advanceTimersByTime(10500);
        expect(
          root.querySelector(".file-input__progress-note")?.textContent,
        ).toContain("Still working");
      });

      it("returns to an idle Home on Cancel, announces it, and ignores a read that finishes late", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const onLoaded = vi.fn();
        const onFailure = vi.fn();
        const release = { current: () => {} };
        renderCharacterFileInput(root, {
          onLoaded,
          onFailure,
          bridgeOptions: slowReads(release),
        });
        startLoad(root, requiredFolderFiles("Cancelled Character"));
        expect(picker(root).disabled).toBe(true);

        root.querySelector<HTMLElement>('[data-action="cancel-load"]')?.click();
        expect(picker(root).disabled).toBe(false);
        expect(status(root).textContent).toBe("Loading cancelled");
        expect(errorBlock(root).hidden).toBe(true);
        expect(
          root
            .querySelector('[data-action="open-folder"]')
            ?.hasAttribute("aria-disabled"),
        ).toBe(false);

        release.current();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(onLoaded).not.toHaveBeenCalled();
        expect(onFailure).not.toHaveBeenCalled();
        expect(status(root).textContent).toBe("Loading cancelled");
      });

      it("lets a new folder be opened right after a cancel", async () => {
        const root = document.createElement("div");
        const onLoaded = vi.fn();
        const release = { current: () => {} };
        let slow = true;
        const gate = new Promise<void>((resolve) => {
          release.current = resolve;
        });
        renderCharacterFileInput(root, {
          onLoaded,
          bridgeOptions: {
            ...testOptions,
            readFileBytes: async (file) => {
              if (slow) await gate;
              return await readFileAsBytes(file);
            },
          },
        });
        startLoad(root, requiredFolderFiles("First"));
        root.querySelector<HTMLElement>('[data-action="cancel-load"]')?.click();
        slow = false;
        await selectViaPicker(root, requiredFolderFiles("Second"));
        release.current();

        expect(onLoaded).toHaveBeenCalledTimes(1);
        expect((onLoaded.mock.calls[0][0] as CharacterData).name).toBe(
          "Second",
        );
      });
    });
  });
});
