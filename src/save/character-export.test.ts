import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type { CharacterData, CommandFile } from "../wasm/types.ts";
import { exportCharacterFiles } from "./character-export.ts";

const testdataDir = path.resolve(import.meta.dirname, "..", "wasm", "testdata");
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

function baseCharacter(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    name: "Test Character",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [],
    ...overrides,
  };
}

function baseDocument(
  overrides: Partial<CharacterDocument> = {},
): CharacterDocument {
  return {
    character: baseCharacter(),
    files: {
      def: textBytes("[Info]\nname = Test\n"),
      air: textBytes(""),
      sff: textBytes(""),
      cns: textBytes(""),
    },
    spriteEdits: [],
    commandFile: emptyCommandFile(),
    ...overrides,
  };
}

/** Canned saveX fakes: echo distinguishable bytes per call so assertions can tell them apart. */
function okSave(bytes: Uint8Array) {
  return vi.fn().mockResolvedValue({ ok: true, bytes });
}

describe("exportCharacterFiles", () => {
  it("blocks export and lists the specific pending sprite edits, without calling any save function", async () => {
    const edits: SpriteEdit[] = [
      { kind: "delete", group: 0, image: 0 },
      {
        kind: "add",
        group: 1,
        image: 2,
        pixels: new Uint8Array(),
        width: 1,
        height: 1,
      },
    ];
    const doc = baseDocument({ spriteEdits: edits });
    const saveDef = okSave(textBytes("def"));
    const saveAir = okSave(textBytes("air"));
    const saveCns = okSave(textBytes("cns"));
    const saveCmd = okSave(textBytes("cmd"));

    const result = await exportCharacterFiles(doc, {
      saveDef,
      saveAir,
      saveCns,
      saveCmd,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a blocked result");
    expect(result.reason).toEqual({ kind: "pending-sprite-edits", edits });
    expect(saveDef).not.toHaveBeenCalled();
    expect(saveAir).not.toHaveBeenCalled();
    expect(saveCns).not.toHaveBeenCalled();
    expect(saveCmd).not.toHaveBeenCalled();
  });

  it("returns def/air/cns marked unchanged when their saved bytes match the original, and omits cmd/zss when neither was ever supplied", async () => {
    const doc = baseDocument();
    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(doc.files.def),
      saveAir: okSave(doc.files.air),
      saveCns: okSave(doc.files.cns),
      saveCmd: okSave(textBytes("cmd")),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    expect(result.files.map((f) => f.kind)).toEqual(["def", "air", "cns"]);
    expect(result.files.every((f) => f.unchanged)).toBe(true);
  });

  it("marks a file modified when its saved bytes differ from the original", async () => {
    const doc = baseDocument();
    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(textBytes("edited def")),
      saveAir: okSave(doc.files.air),
      saveCns: okSave(doc.files.cns),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    const def = result.files.find((f) => f.kind === "def");
    expect(def?.unchanged).toBe(false);
  });

  it("includes .cmd (marked modified) when the original had one, even if the new bytes differ", async () => {
    const doc = baseDocument({
      files: {
        def: textBytes("def"),
        air: textBytes("air"),
        sff: textBytes(""),
        cns: textBytes("cns"),
        cmd: textBytes("original cmd"),
      },
    });
    const saveCmd = okSave(textBytes("different cmd"));

    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(doc.files.def),
      saveAir: okSave(doc.files.air),
      saveCns: okSave(doc.files.cns),
      saveCmd,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    expect(saveCmd).toHaveBeenCalledWith(
      textBytes("original cmd"),
      doc.commandFile,
      undefined,
    );
    const cmd = result.files.find((f) => f.kind === "cmd");
    expect(cmd?.unchanged).toBe(false);
  });

  it("excludes .cmd when there was no original file and no commands were added", async () => {
    const doc = baseDocument();
    const saveCmd = okSave(textBytes("cmd"));

    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(doc.files.def),
      saveAir: okSave(doc.files.air),
      saveCns: okSave(doc.files.cns),
      saveCmd,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    expect(result.files.some((f) => f.kind === "cmd")).toBe(false);
    expect(saveCmd).not.toHaveBeenCalled();
  });

  it("includes a brand new .cmd (from an empty original) when the user added a command despite no original file", async () => {
    const commandFile: CommandFile = {
      ...emptyCommandFile(),
      commands: [{ name: "a", input: "a", time: 0, bufferTime: 0 }],
    };
    const doc = baseDocument({ commandFile });
    const saveCmd = okSave(textBytes("new cmd"));

    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(doc.files.def),
      saveAir: okSave(doc.files.air),
      saveCns: okSave(doc.files.cns),
      saveCmd,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    expect(saveCmd).toHaveBeenCalledWith(
      new Uint8Array(0),
      commandFile,
      undefined,
    );
    const cmd = result.files.find((f) => f.kind === "cmd");
    expect(cmd?.unchanged).toBe(false);
  });

  it("passes .zss through byte-for-byte unchanged when one was supplied, and omits it when none was", async () => {
    const zssBytes = textBytes("zss content");
    const withZss = baseDocument({
      files: { ...baseDocument().files, zss: zssBytes },
    });

    const withResult = await exportCharacterFiles(withZss, {
      saveDef: okSave(withZss.files.def),
      saveAir: okSave(withZss.files.air),
      saveCns: okSave(withZss.files.cns),
    });
    expect(withResult.ok).toBe(true);
    if (!withResult.ok) throw new Error("expected an ok result");
    const zss = withResult.files.find((f) => f.kind === "zss");
    expect(zss?.bytes).toEqual(zssBytes);
    expect(zss?.unchanged).toBe(true);

    const withoutZss = baseDocument();
    const withoutResult = await exportCharacterFiles(withoutZss, {
      saveDef: okSave(withoutZss.files.def),
      saveAir: okSave(withoutZss.files.air),
      saveCns: okSave(withoutZss.files.cns),
    });
    expect(withoutResult.ok).toBe(true);
    if (!withoutResult.ok) throw new Error("expected an ok result");
    expect(withoutResult.files.some((f) => f.kind === "zss")).toBe(false);
  });

  it("uses the character's referenced file names for air/cns/cmd, falling back to generic names when blank", async () => {
    const namedDoc = baseDocument({
      character: baseCharacter({
        animationFile: "kfm.air",
        constantsFile: "sub/kfm.cns",
        commandFile: "kfm.cmd",
      }),
      files: {
        def: textBytes("def"),
        air: textBytes("air"),
        sff: textBytes(""),
        cns: textBytes("cns"),
        cmd: textBytes("cmd"),
      },
    });
    const named = await exportCharacterFiles(namedDoc, {
      saveDef: okSave(namedDoc.files.def),
      saveAir: okSave(namedDoc.files.air),
      saveCns: okSave(namedDoc.files.cns),
      saveCmd: okSave(namedDoc.files.cmd as Uint8Array),
    });
    if (!named.ok) throw new Error("expected an ok result");
    expect(named.files.find((f) => f.kind === "air")?.fileName).toBe("kfm.air");
    // A referenced path with a directory prefix is reduced to its basename.
    expect(named.files.find((f) => f.kind === "cns")?.fileName).toBe("kfm.cns");
    expect(named.files.find((f) => f.kind === "cmd")?.fileName).toBe("kfm.cmd");

    const blankDoc = baseDocument();
    const blank = await exportCharacterFiles(blankDoc, {
      saveDef: okSave(blankDoc.files.def),
      saveAir: okSave(blankDoc.files.air),
      saveCns: okSave(blankDoc.files.cns),
    });
    if (!blank.ok) throw new Error("expected an ok result");
    expect(blank.files.find((f) => f.kind === "def")?.fileName).toBe(
      "character.def",
    );
    expect(blank.files.find((f) => f.kind === "air")?.fileName).toBe(
      "character.air",
    );
    expect(blank.files.find((f) => f.kind === "cns")?.fileName).toBe(
      "character.cns",
    );
  });

  it("blocks export and names the failing file when a save call itself errors, without attempting later files", async () => {
    const doc = baseDocument();
    const saveCns = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "juggle: value out of range" });
    const saveCmd = okSave(textBytes("cmd"));

    const result = await exportCharacterFiles(doc, {
      saveDef: okSave(doc.files.def),
      saveAir: okSave(doc.files.air),
      saveCns,
      saveCmd,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a blocked result");
    expect(result.reason).toEqual({
      kind: "serialize-error",
      fileKind: "cns",
      fileName: "character.cns",
      message: "juggle: value out of range",
    });
    expect(saveCmd).not.toHaveBeenCalled();
  });
});

describe("exportCharacterFiles (real WASM integration)", () => {
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

  const defBytes = textBytes(
    [
      "[Info]",
      "name = Export Test",
      "[Files]",
      "cns = export-test.cns",
      "",
    ].join("\n"),
  );
  const airBytes = fixture("sample.air");
  const cnsBytes = fixture("sample.cns");
  const sffBytes = fixture("v1-basic.sff");

  it("round-trips an untouched character byte-for-byte across every file, using the real WASM save path", async () => {
    resetWasmBridgeForTests();
    const doc = baseDocument({
      character: baseCharacter({
        name: "Export Test",
        constantsFile: "export-test.cns",
        animations: [],
        stateDefs: [],
      }),
      files: { def: defBytes, air: airBytes, sff: sffBytes, cns: cnsBytes },
    });

    // Load through the real bridge first so `character` matches exactly what
    // parsing `defBytes`/`airBytes`/`cnsBytes` itself produces -- otherwise a
    // hand-built fixture could disagree with the parser in some field this
    // test doesn't otherwise exercise, an unrelated flake this integration
    // test isn't meant to catch.
    const { loadCharacter } = await import("../wasm/bridge.ts");
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      bridgeOptions,
    );
    if (!loaded.ok) throw new Error(`expected ok load: ${loaded.error}`);
    doc.character = loaded.character;

    const result = await exportCharacterFiles(doc, { bridgeOptions });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    expect(result.files.every((f) => f.unchanged)).toBe(true);
    expect(result.files.find((f) => f.kind === "def")?.bytes).toEqual(defBytes);
    expect(result.files.find((f) => f.kind === "air")?.bytes).toEqual(airBytes);
    expect(result.files.find((f) => f.kind === "cns")?.bytes).toEqual(cnsBytes);
  });

  it("reflects a real edit (added StateDef) as a modified .cns file, still valid MUGEN/Ikemen data on reload", async () => {
    resetWasmBridgeForTests();
    const { loadCharacter } = await import("../wasm/bridge.ts");
    const loaded = await loadCharacter(
      defBytes,
      airBytes,
      sffBytes,
      cnsBytes,
      bridgeOptions,
    );
    if (!loaded.ok) throw new Error(`expected ok load: ${loaded.error}`);

    const doc = baseDocument({
      character: {
        ...loaded.character,
        stateDefs: [
          ...loaded.character.stateDefs,
          {
            number: 12345,
            type: "S",
            moveType: "I",
            physics: "S",
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
        ],
      },
      files: { def: defBytes, air: airBytes, sff: sffBytes, cns: cnsBytes },
    });

    const result = await exportCharacterFiles(doc, { bridgeOptions });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an ok result");
    const cns = result.files.find((f) => f.kind === "cns");
    expect(cns?.unchanged).toBe(false);
    expect(new TextDecoder().decode(cns?.bytes)).toContain("Statedef 12345");
  });
});
