import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCharacterDocument,
  resetCharacterDocumentForTests,
} from "./document/character-document.ts";
import { renderApp } from "./main.ts";
import { resetWasmBridgeForTests } from "./wasm/bridge.ts";
import type { WasmBridgeOptions } from "./wasm/bridge.ts";
import { MIN_SUPPORTED_WEB_UI_KIT_VERSION } from "./web-ui-kit-version.ts";

const publicWasmDir = path.resolve(import.meta.dirname, "..", "public", "wasm");
const bridgeOptions: WasmBridgeOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
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

    renderApp(root, "0.1.0", "0.5.0");

    const shell = root.querySelector("wuik-app-shell");
    expect(shell).not.toBeNull();

    const toolbar = shell?.querySelector('[slot="toolbar"]');
    expect(toolbar?.tagName.toLowerCase()).toBe("wuik-toolbar");
    expect(toolbar?.textContent).toContain("Character Editor — v0.1.0");

    const toggle = toolbar?.querySelector("wuik-button");
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe("Switch to dark mode");
  });

  it("toggles the page theme to dark, then back to light, when the theme button is activated", () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.5.0");

    const toggle = root.querySelector<HTMLElement>("wuik-button");
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

    renderApp(root, "0.1.0", "0.5.0");
    renderApp(root, "0.2.0", "0.5.0");

    expect(root.querySelectorAll("wuik-app-shell")).toHaveLength(1);
    expect(root.querySelector('[slot="toolbar"]')?.textContent).toContain(
      "Character Editor — v0.2.0",
    );
  });

  it("shows a clear, announced error instead of an unstyled shell when web-ui-kit is too old", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");

    expect(root.querySelector("wuik-app-shell")).toBeNull();
    const alert = root.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("aria-live")).toBe("assertive");
    expect(alert?.textContent).toContain(MIN_SUPPORTED_WEB_UI_KIT_VERSION);
    expect(alert?.textContent).toContain("0.3.0");
  });

  it("replaces a previously rendered error state once a supported version is given", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");
    renderApp(root, "0.1.0", "0.5.0");

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector("wuik-app-shell")).not.toBeNull();
  });

  it("mounts the character file input into the shell's main content", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

    const dropZone = root.querySelector(".file-input__dropzone");
    expect(dropZone).not.toBeNull();
  });

  it("stores the loaded character and raw file bytes in the in-memory document once the 4 required files load successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

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
    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

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
    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

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

  it("mounts the sprite browser once a character loads successfully", async () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

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
    renderApp(root, "0.1.0", "0.5.0", { bridgeOptions });

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
});
