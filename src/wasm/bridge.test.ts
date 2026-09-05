import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadCharacter,
  loadCmd,
  resetWasmBridgeForTests,
  resolveSpritePixels,
  saveAir,
  saveCmd,
  saveCns,
  saveDef,
} from "./bridge.ts";
import type { CharacterInfoFields } from "./types.ts";

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

describe("loadCmd", () => {
  it("parses a real .cmd file's remap, defaults, commands, and linked always-state controllers", async () => {
    const result = await loadCmd(fixture("sample.cmd"), testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.commandFile.remap).toEqual({ a: "a", b: "b", x: "y" });
    expect(result.commandFile.defaults).toEqual({ time: 15, bufferTime: 1 });
    expect(result.commandFile.commands).toEqual([
      { name: "a", input: "a", time: 1, bufferTime: 0 },
      { name: "QCF_a", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ]);
    expect(result.commandFile.states).toHaveLength(1);
    expect(result.commandFile.states[0].controllers).toHaveLength(2);
    const changeState = result.commandFile.states[0].controllers.find(
      (c) => c.type === "ChangeState",
    );
    expect(changeState?.triggers).toContain('command = "QCF_a"');
    expect(changeState?.parameters.value).toBe("1000");
  });

  it("returns an empty-but-valid CommandFile instead of throwing for an empty file", async () => {
    const result = await loadCmd(new Uint8Array(0), testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.commandFile.commands).toEqual([]);
    expect(result.commandFile.states).toEqual([]);
    expect(result.commandFile.remap).toEqual({});
  });

  it("returns a typed error instead of throwing for a malformed .cmd file", async () => {
    const result = await loadCmd(
      textBytes("[Command\nthis is not closed"),
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("still returns a correct result after a prior call reported an error", async () => {
    const failed = await loadCmd(
      textBytes("[Command\nthis is not closed"),
      testOptions,
    );
    expect(failed.ok).toBe(false);

    const succeeded = await loadCmd(fixture("sample.cmd"), testOptions);
    expect(succeeded.ok).toBe(true);
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

/** Picks exactly the 9 fields `saveDef`'s `editedInfoJSON` argument expects off a loaded CharacterData. */
function infoFieldsOf(character: {
  name: string;
  author: string;
  spriteFile: string;
  animationFile: string;
  soundFile: string;
  commandFile: string;
  constantsFile: string;
  stateFiles: string[];
  palettes: string[];
}): CharacterInfoFields {
  return {
    name: character.name,
    author: character.author,
    spriteFile: character.spriteFile,
    animationFile: character.animationFile,
    soundFile: character.soundFile,
    commandFile: character.commandFile,
    constantsFile: character.constantsFile,
    stateFiles: character.stateFiles,
    palettes: character.palettes,
  };
}

describe("saveDef", () => {
  it("round-trips an unmodified character definition byte-for-byte", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const result = await saveDef(
      defBytes,
      infoFieldsOf(loaded.character),
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).toEqual(defBytes);
  });

  it("produces different bytes reflecting an edited name, loadable back with the new value", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const result = await saveDef(
      defBytes,
      { ...infoFieldsOf(loaded.character), name: "Renamed Character" },
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).not.toEqual(defBytes);

    const reloaded = await loadCharacter(
      result.bytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!reloaded.ok) throw new Error("expected ok result");
    expect(reloaded.character.name).toBe("Renamed Character");
  });

  it("treats an empty originalDefBytes as a brand new file instead of erroring", async () => {
    const result = await saveDef(
      new Uint8Array(0),
      {
        name: "Brand New",
        author: "",
        spriteFile: "",
        animationFile: "",
        soundFile: "",
        commandFile: "",
        constantsFile: "",
        stateFiles: [],
        palettes: [],
      },
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("returns a typed error instead of throwing when the original bytes are malformed", async () => {
    const result = await saveDef(
      textBytes("[Bad Section\nname = X\n"),
      infoFieldsOf({
        name: "X",
        author: "",
        spriteFile: "",
        animationFile: "",
        soundFile: "",
        commandFile: "",
        constantsFile: "",
        stateFiles: [],
        palettes: [],
      }),
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("saveAir", () => {
  it("round-trips unmodified animations byte-for-byte", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const result = await saveAir(
      airBytes,
      loaded.character.animations,
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).toEqual(airBytes);
  });

  it("produces different bytes reflecting an added animation", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const edited = [
      ...loaded.character.animations,
      { number: 9999, frames: [], loopStart: 0 },
    ];
    const result = await saveAir(airBytes, edited, testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).not.toEqual(airBytes);
  });

  it("treats an empty originalAirBytes as a brand new file instead of erroring", async () => {
    const result = await saveAir(new Uint8Array(0), [], testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
  });

  it("returns a typed error instead of throwing when the original bytes are malformed", async () => {
    const result = await saveAir(
      textBytes("[Begin Action abc]\n"),
      [],
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("saveCns", () => {
  it("round-trips unmodified StateDefs byte-for-byte", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const result = await saveCns(
      cnsBytes,
      loaded.character.stateDefs,
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).toEqual(cnsBytes);
  });

  it("produces different bytes reflecting an added StateDef", async () => {
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      testOptions,
    );
    if (!loaded.ok) throw new Error("expected ok result");

    const edited = [
      ...loaded.character.stateDefs,
      {
        number: 9999,
        type: "S" as const,
        moveType: "I" as const,
        physics: "S" as const,
        anim: 0,
        ctrl: false,
        powerAdd: 0,
        juggle: 0,
        faceP2: false,
        hitDefPersist: false,
        moveHitPersist: false,
        hitCountPersist: false,
        sprPriority: 0,
        controllers: [],
      },
    ];
    const result = await saveCns(cnsBytes, edited, testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).not.toEqual(cnsBytes);
  });

  it("treats an empty originalCnsBytes as a brand new file instead of erroring", async () => {
    const result = await saveCns(new Uint8Array(0), [], testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
  });

  it("returns a typed error instead of throwing when the original bytes are malformed", async () => {
    const result = await saveCns(
      textBytes("[Statedef abc]\n"),
      [],
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("saveCmd", () => {
  it("round-trips an unmodified .cmd file byte-for-byte", async () => {
    const cmdBytes = fixture("sample.cmd");
    const loaded = await loadCmd(cmdBytes, testOptions);
    if (!loaded.ok) throw new Error("expected ok result");

    const result = await saveCmd(cmdBytes, loaded.commandFile, testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).toEqual(cmdBytes);
  });

  it("produces different bytes reflecting an added command", async () => {
    const cmdBytes = fixture("sample.cmd");
    const loaded = await loadCmd(cmdBytes, testOptions);
    if (!loaded.ok) throw new Error("expected ok result");

    const edited = {
      ...loaded.commandFile,
      commands: [
        ...loaded.commandFile.commands,
        { name: "new_move", input: "a", time: 0, bufferTime: 0 },
      ],
    };
    const result = await saveCmd(cmdBytes, edited, testOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bytes).not.toEqual(cmdBytes);
  });

  it("treats an empty originalCmdBytes as a brand new file instead of erroring", async () => {
    const result = await saveCmd(
      new Uint8Array(0),
      {
        remap: {},
        defaults: { time: 0, bufferTime: 0 },
        commands: [],
        states: [],
      },
      testOptions,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
  });

  it("returns a typed error instead of throwing when the original bytes are malformed", async () => {
    const result = await saveCmd(
      textBytes("[Command\nthis is not closed"),
      {
        remap: {},
        defaults: { time: 0, bufferTime: 0 },
        commands: [],
        states: [],
      },
      testOptions,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.length).toBeGreaterThan(0);
  });
});
