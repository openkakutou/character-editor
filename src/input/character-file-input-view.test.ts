import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { renderCharacterFileInput } from "./character-file-input-view.ts";

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

function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

function fileFromBytes(name: string, bytes: Uint8Array): File {
  return new File([bytes as BufferSource], name);
}

function dispatchDrop(dropZone: Element, files: File[]): void {
  const dataTransfer = { files } as unknown as DataTransfer;
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  dropZone.dispatchEvent(event);
}

beforeEach(() => {
  resetWasmBridgeForTests();
});

function requiredFiles(): File[] {
  return [
    fileFromBytes("ryu.def", textBytes("[Info]\nname = View Test Character\n")),
    fileFromBytes("ryu.air", fixtureBytes("sample.air")),
    fileFromBytes("ryu.sff", fixtureBytes("v1-basic.sff")),
    fileFromBytes("ryu.cns", fixtureBytes("sample.cns")),
  ];
}

describe("renderCharacterFileInput", () => {
  it("lists all 6 slots as missing/not-provided before anything is dropped, required ones marked distinctly from optional ones", () => {
    const root = document.createElement("div");
    renderCharacterFileInput(root, { onLoaded: vi.fn() });

    const slotTexts = Array.from(
      root.querySelectorAll(".file-input__slot"),
    ).map((el) => el.textContent);

    expect(slotTexts.some((text) => text?.includes(".def"))).toBe(true);
    expect(slotTexts.some((text) => text?.includes("optional"))).toBe(true);
  });

  it("auto-loads and calls onLoaded once the 4 required files are dropped, with no optional file supplied", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));

    const [character] = onLoaded.mock.calls[0] as [CharacterData, unknown];
    expect(character.name).toBe("View Test Character");

    const status = root.querySelector(".file-input__status");
    expect(status?.textContent).toContain("View Test Character");
  });

  it("does not block or mark as error the optional slots when only the 4 required files are given", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    dispatchDrop(dropZone, requiredFiles());

    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));

    const cmdSlot = root.querySelector('.file-input__slot[data-kind="cmd"]');
    expect(cmdSlot?.classList.contains("file-input__slot--error")).toBe(false);
  });

  it("shows a per-slot error naming the missing required file without auto-loading when one required file is absent", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    const [def, air, sff] = requiredFiles();
    dispatchDrop(dropZone, [def, air, sff]);

    // Give any stray microtask a chance to run; nothing should auto-load.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLoaded).not.toHaveBeenCalled();

    const cnsSlot = root.querySelector('.file-input__slot[data-kind="cns"]');
    expect(cnsSlot?.textContent).toContain("Missing");
  });

  it("a duplicate optional file does not block auto-load of an otherwise-complete required set", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    const cmdA = fileFromBytes("ryu-a.cmd", textBytes("a"));
    const cmdB = fileFromBytes("ryu-b.cmd", textBytes("b"));
    dispatchDrop(dropZone, [...requiredFiles(), cmdA, cmdB]);

    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));

    const cmdSlot = root.querySelector('.file-input__slot[data-kind="cmd"]');
    expect(cmdSlot?.classList.contains("file-input__slot--error")).toBe(true);
  });

  it("shows a bridge-error status message without crashing when a required file's contents are malformed", async () => {
    const root = document.createElement("div");
    const onLoaded = vi.fn();
    renderCharacterFileInput(root, { onLoaded, bridgeOptions: testOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    if (!dropZone) throw new Error("dropzone not found");
    const [def, air, , cns] = requiredFiles();
    const badSff = fileFromBytes("ryu.sff", textBytes("not a real sff file"));
    dispatchDrop(dropZone, [def, air, badSff, cns]);

    await vi.waitFor(() => {
      const status = root.querySelector(".file-input__status");
      expect(status?.textContent).toContain("Could not load character");
    });
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
