import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadCharacter,
  resetWasmBridgeForTests,
  resolveSpritePixels,
} from "./bridge.ts";

// The real WASM assets (public/wasm/, gitignored) are fetched via
// `npm run wasm:download` before tests run in this environment. There is no
// running dev server under jsdom, so the fetch effects are injected as
// Node-backed stubs instead — the same jsdom-compatibility concern
// character-viewer-web's own src/wasm/bridge.test.ts documents.
const publicWasmDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
);
const testOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
};

const testdataDir = path.resolve(import.meta.dirname, "testdata");
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

// Wrapped in `new Uint8Array(...)`: under Vitest's jsdom environment,
// TextEncoder is a Node-realm polyfill, so its output otherwise fails
// jsdom-realm `instanceof Uint8Array` checks (including the WASM module's
// own argument validation) despite being a genuine byte buffer.
function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

// Exercises every CharacterInfo field character.LoadBytes threads onto
// Character (name, author, referenced file paths, state files, palettes) —
// not just name, unlike the read-only viewer's own minimal fixture — since
// this editor app's typed CharacterData mirrors the full JSON contract.
const defBytes = textBytes(
  [
    "[Info]",
    "name = Bridge Test Character",
    "author = Someone",
    "[Files]",
    "cmd = bridge-test.cmd",
    "cns = bridge-test.cns",
    "sprite = bridge-test.sff",
    "anim = bridge-test.air",
    "sound = bridge-test.snd",
    "st1 = bridge-test-1.st",
    "pal1 = bridge-test-1.act",
    "pal2 = bridge-test-2.act",
    "",
  ].join("\n"),
);
const airBytes = fixture("sample.air");
const sffBytes = fixture("v1-basic.sff");
const cnsBytes = fixture("sample.cns");

beforeEach(() => {
  resetWasmBridgeForTests();
});

describe("loadCharacter", () => {
  it("loads and instantiates the WASM module and returns a typed character for valid input", async () => {
    const result = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.character.name).toBe("Bridge Test Character");
    expect(result.character.animations).toHaveLength(2);
    expect(result.character.sprites).toHaveLength(1);
    expect(result.character.stateDefs).toHaveLength(3);
  });

  it("maps every CharacterInfo metadata field (author, referenced file paths, state files, palettes)", async () => {
    const result = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.character.author).toBe("Someone");
    expect(result.character.commandFile).toBe("bridge-test.cmd");
    expect(result.character.constantsFile).toBe("bridge-test.cns");
    expect(result.character.spriteFile).toBe("bridge-test.sff");
    expect(result.character.animationFile).toBe("bridge-test.air");
    expect(result.character.soundFile).toBe("bridge-test.snd");
    expect(result.character.stateFiles).toEqual(["bridge-test-1.st"]);
    expect(result.character.palettes).toEqual([
      "bridge-test-1.act",
      "bridge-test-2.act",
    ]);
  });

  it("defaults metadata fields to empty instead of undefined when the .def has no [Files] section", async () => {
    const result = await loadCharacter(
      textBytes("[Info]\nname = Minimal\n"),
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.character.author).toBe("");
    expect(result.character.stateFiles).toEqual([]);
    expect(result.character.palettes).toEqual([]);
  });

  it("returns a typed error instead of throwing when the sprite bytes are malformed", async () => {
    const result = await loadCharacter(
      defBytes,
      airBytes,
      textBytes("not a real .sff file"),
      cnsBytes,
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("returns a typed error instead of throwing when every buffer is empty", async () => {
    const empty = new Uint8Array(0);
    const result = await loadCharacter(empty, empty, empty, empty, testOptions);

    // An empty .def has no name — character.LoadBytes rejects it as
    // malformed input (a real .def always has at least [Info]/name), so
    // this must surface as a typed error, never a thrown exception.
    expect(result.ok).toBe(false);
  });

  it("still returns a correct result after a prior call reported an error", async () => {
    const failed = await loadCharacter(
      defBytes,
      airBytes,
      textBytes("not a real .sff file"),
      cnsBytes,
      testOptions,
    );
    expect(failed.ok).toBe(false);

    const succeeded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    expect(succeeded.ok).toBe(true);
  });

  it("reuses the same WASM instantiation across repeated calls instead of re-fetching", async () => {
    let fetchCount = 0;
    const countingOptions = {
      fetchWasmExecSource: async () => {
        fetchCount++;
        return testOptions.fetchWasmExecSource();
      },
      fetchWasmBytes: testOptions.fetchWasmBytes,
    };

    await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      countingOptions,
    );
    await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      countingOptions,
    );

    expect(fetchCount).toBe(1);
  });
});

describe("resolveSpritePixels", () => {
  it("decodes a real sprite's pixels at its correct dimensions", async () => {
    const [result] = await resolveSpritePixels(
      sffBytes,
      [[0, 0]],
      null,
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.pixels).toBeInstanceOf(Uint8Array);
    expect(result.pixels.length).toBe(result.width * result.height * 4);
  });

  it("returns one typed result per request, in the same order", async () => {
    const results = await resolveSpritePixels(
      sffBytes,
      [
        [0, 0],
        [999, 999],
      ],
      null,
      testOptions,
    );

    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
  });

  it("returns a distinguishable error for a sprite that doesn't exist, instead of throwing", async () => {
    const [result] = await resolveSpritePixels(
      sffBytes,
      [[999, 999]],
      null,
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error).toContain("sprite not found");
  });

  it("returns a typed error instead of throwing for malformed sffBytes", async () => {
    const garbageSffBytes = textBytes("this is not a valid .sff file");

    const [result] = await resolveSpritePixels(
      garbageSffBytes,
      [[0, 0]],
      null,
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });
});
