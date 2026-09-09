import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import {
  buildCharacterInfo,
  createCharacterFromWizard,
} from "./new-character-wizard.ts";

const publicWasmDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
);
const bridgeOptions: WasmBridgeOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
};

const blankSffBytes = new Uint8Array(
  readFileSync(
    path.resolve(import.meta.dirname, "..", "wasm", "testdata", "v1-basic.sff"),
  ),
);
const fetchBlankSffBytes = async (): Promise<Uint8Array> => blankSffBytes;

beforeEach(() => {
  resetWasmBridgeForTests();
});

describe("buildCharacterInfo", () => {
  it("derives file-path fields from the character's name", () => {
    const info = buildCharacterInfo("My New Fighter");
    expect(info.name).toBe("My New Fighter");
    expect(info.spriteFile).toBe("my-new-fighter.sff");
    expect(info.animationFile).toBe("my-new-fighter.air");
    expect(info.constantsFile).toBe("my-new-fighter.cns");
    expect(info.commandFile).toBe("my-new-fighter.cmd");
  });

  it("starts with no author, state files, or palettes", () => {
    const info = buildCharacterInfo("Anyone");
    expect(info.author).toBe("");
    expect(info.stateFiles).toEqual([]);
    expect(info.palettes).toEqual([]);
  });

  it("falls back to a generic slug when the name has no alphanumeric characters", () => {
    const info = buildCharacterInfo("!!!");
    expect(info.spriteFile).toBe("character.sff");
  });
});

describe("createCharacterFromWizard", () => {
  it("creates a valid, loadable blank character with no animations or states", async () => {
    const result = await createCharacterFromWizard("Blank Fighter", "blank", {
      ...bridgeOptions,
      fetchBlankSffBytes,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.character.name).toBe("Blank Fighter");
    expect(result.character.animations).toEqual([]);
    expect(result.character.stateDefs).toEqual([]);
    expect(result.files.def).toBeInstanceOf(Uint8Array);
    expect(result.files.air).toBeInstanceOf(Uint8Array);
    expect(result.files.sff).toBeInstanceOf(Uint8Array);
    expect(result.files.cns).toBeInstanceOf(Uint8Array);
    expect(result.files.cmd).toBeInstanceOf(Uint8Array);
  });

  it("creates a valid, loadable basic-template character with one animation and one state", async () => {
    const result = await createCharacterFromWizard("Basic Fighter", "basic", {
      ...bridgeOptions,
      fetchBlankSffBytes,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.character.name).toBe("Basic Fighter");
    expect(result.character.animations).toHaveLength(1);
    expect(result.character.stateDefs).toHaveLength(1);
    expect(result.character.sprites.length).toBeGreaterThan(0);
  });

  it("returns a bridge-error instead of creating a character when the name is blank", async () => {
    const result = await createCharacterFromWizard("   ", "blank", {
      ...bridgeOptions,
      fetchBlankSffBytes,
    });

    expect(result.status).toBe("bridge-error");
  });

  it("returns a bridge-error, not a thrown exception, when the blank sprite sheet can't be fetched", async () => {
    const result = await createCharacterFromWizard("Someone", "blank", {
      ...bridgeOptions,
      fetchBlankSffBytes: async () => {
        throw new Error("network down");
      },
    });

    expect(result.status).toBe("bridge-error");
    if (result.status !== "bridge-error") throw new Error("expected error");
    expect(result.message).toContain("network down");
  });

  it("returns a bridge-error, not a thrown exception, when the underlying WASM bridge fails to load", async () => {
    const result = await createCharacterFromWizard("Someone", "blank", {
      fetchWasmExecSource: async () => {
        throw new Error("wasm unavailable");
      },
      fetchBlankSffBytes,
    });

    expect(result.status).toBe("bridge-error");
  });
});
