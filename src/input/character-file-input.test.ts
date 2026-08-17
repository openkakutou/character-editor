import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import {
  type CharacterFileInputOptions,
  type CompleteFileSlots,
  type FileSlots,
  OPTIONAL_FILE_KINDS,
  REQUIRED_FILE_KINDS,
  isComplete,
  loadCharacterFromSlots,
  mergeFiles,
  missingRequiredKinds,
  readFileAsBytes,
} from "./character-file-input.ts";

// Real WASM assets (public/wasm/, gitignored) fetched via `npm run
// wasm:download` before tests run — injected as Node-backed stubs since
// there is no running dev server under jsdom. Mirrors
// src/wasm/bridge.test.ts's own setup.
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

beforeEach(() => {
  resetWasmBridgeForTests();
});

describe("REQUIRED_FILE_KINDS / OPTIONAL_FILE_KINDS", () => {
  it("keeps the 4 WASM-loadable kinds required and the 2 write-back-only kinds optional", () => {
    expect(REQUIRED_FILE_KINDS).toEqual(["def", "air", "sff", "cns"]);
    expect(OPTIONAL_FILE_KINDS).toEqual(["cmd", "zss"]);
  });
});

describe("mergeFiles", () => {
  it("classifies files by extension case-insensitively across all 6 kinds and fills empty slots", () => {
    const def = fileFromBytes("Ryu.DEF", textBytes("def"));
    const air = fileFromBytes("ryu.Air", textBytes("air"));
    const sff = fileFromBytes("ryu.sff", textBytes("sff"));
    const cns = fileFromBytes("ryu.cns", textBytes("cns"));
    const cmd = fileFromBytes("ryu.CMD", textBytes("cmd"));
    const zss = fileFromBytes("ryu.zss", textBytes("zss"));

    const result = mergeFiles({}, [def, air, sff, cns, cmd, zss]);

    expect(result.slots).toEqual({ def, air, sff, cns, cmd, zss });
    expect(result.ignored).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("accumulates across multiple merge calls without losing previously filled slots", () => {
    const def = fileFromBytes("ryu.def", textBytes("def"));
    const cmd = fileFromBytes("ryu.cmd", textBytes("cmd"));

    const first = mergeFiles({}, [def]);
    const second = mergeFiles(first.slots, [cmd]);

    expect(second.slots).toEqual({ def, cmd });
  });

  it("replaces a slot's file when a new file of the same kind is merged in a later call", () => {
    const badSff = fileFromBytes("ryu.sff", textBytes("garbage"));
    const goodSff = fileFromBytes("ryu-fixed.sff", textBytes("real sff bytes"));

    const first = mergeFiles({}, [badSff]);
    const second = mergeFiles(first.slots, [goodSff]);

    expect(second.slots.sff).toBe(goodSff);
  });

  it("reports files with an unrecognized extension as ignored instead of assigning them", () => {
    const readme = fileFromBytes("readme.txt", textBytes("notes"));
    const def = fileFromBytes("ryu.def", textBytes("def"));

    const result = mergeFiles({}, [readme, def]);

    expect(result.ignored).toEqual([readme]);
    expect(result.slots).toEqual({ def });
  });

  it("reports two files of the same required kind given in one call as a duplicate, naming both filenames, and leaves that slot untouched", () => {
    const defA = fileFromBytes("ryu-a.def", textBytes("a"));
    const defB = fileFromBytes("ryu-b.def", textBytes("b"));
    const existingSff = fileFromBytes("ryu.sff", textBytes("sff"));

    const result = mergeFiles({ sff: existingSff }, [defA, defB]);

    expect(result.duplicates).toEqual([
      { kind: "def", fileNames: ["ryu-a.def", "ryu-b.def"] },
    ]);
    expect(result.slots).toEqual({ sff: existingSff });
  });

  it("reports two files of the same optional kind given in one call as a duplicate too", () => {
    const cmdA = fileFromBytes("ryu-a.cmd", textBytes("a"));
    const cmdB = fileFromBytes("ryu-b.cmd", textBytes("b"));

    const result = mergeFiles({}, [cmdA, cmdB]);

    expect(result.duplicates).toEqual([
      { kind: "cmd", fileNames: ["ryu-a.cmd", "ryu-b.cmd"] },
    ]);
    expect(result.slots).toEqual({});
  });
});

describe("missingRequiredKinds", () => {
  it("lists all four required kinds as missing for empty slots, ignoring optional kinds entirely", () => {
    expect(missingRequiredKinds({})).toEqual(["def", "air", "sff", "cns"]);
  });

  it("lists only the required kinds not yet present, never an optional one", () => {
    const slots: FileSlots = {
      def: fileFromBytes("ryu.def", textBytes("def")),
      sff: fileFromBytes("ryu.sff", textBytes("sff")),
      cmd: fileFromBytes("ryu.cmd", textBytes("cmd")),
    };

    expect(missingRequiredKinds(slots)).toEqual(["air", "cns"]);
  });

  it("returns an empty array once all four required kinds are present, regardless of optional slots", () => {
    const slots: FileSlots = {
      def: fileFromBytes("ryu.def", textBytes("def")),
      air: fileFromBytes("ryu.air", textBytes("air")),
      sff: fileFromBytes("ryu.sff", textBytes("sff")),
      cns: fileFromBytes("ryu.cns", textBytes("cns")),
    };

    expect(missingRequiredKinds(slots)).toEqual([]);
  });
});

describe("isComplete", () => {
  it("is false when at least one required kind is missing, even with both optional kinds present", () => {
    expect(
      isComplete({
        def: fileFromBytes("ryu.def", textBytes("def")),
        cmd: fileFromBytes("ryu.cmd", textBytes("cmd")),
        zss: fileFromBytes("ryu.zss", textBytes("zss")),
      }),
    ).toBe(false);
  });

  it("is true once all four required kinds are present, with no optional kind supplied at all", () => {
    const slots: FileSlots = {
      def: fileFromBytes("ryu.def", textBytes("def")),
      air: fileFromBytes("ryu.air", textBytes("air")),
      sff: fileFromBytes("ryu.sff", textBytes("sff")),
      cns: fileFromBytes("ryu.cns", textBytes("cns")),
    };

    expect(isComplete(slots)).toBe(true);
  });
});

describe("loadCharacterFromSlots", () => {
  function requiredOnlySlots(): CompleteFileSlots {
    return {
      def: fileFromBytes(
        "ryu.def",
        textBytes("[Info]\nname = File Input Test Character\n"),
      ),
      air: fileFromBytes("ryu.air", fixtureBytes("sample.air")),
      sff: fileFromBytes("ryu.sff", fixtureBytes("v1-basic.sff")),
      cns: fileFromBytes("ryu.cns", fixtureBytes("sample.cns")),
    };
  }

  it("reads the 4 required files and loads the character via the WASM bridge, with no optional slots supplied", async () => {
    const result = await loadCharacterFromSlots(
      requiredOnlySlots(),
      testOptions,
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.character.name).toBe("File Input Test Character");
    expect(result.character.animations).toHaveLength(2);
    expect(result.files.cmd).toBeUndefined();
    expect(result.files.zss).toBeUndefined();
  });

  it("also captures the raw bytes of every supplied kind, required and optional, for later editors to read/write back", async () => {
    const slots: CompleteFileSlots = {
      ...requiredOnlySlots(),
      cmd: fileFromBytes("ryu.cmd", textBytes("cmd contents")),
      zss: fileFromBytes("ryu.zss", textBytes("zss contents")),
    };

    const result = await loadCharacterFromSlots(slots, testOptions);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.files.def).toBeInstanceOf(Uint8Array);
    expect(result.files.sff).toEqual(fixtureBytes("v1-basic.sff"));
    expect(result.files.cmd).toEqual(textBytes("cmd contents"));
    expect(result.files.zss).toEqual(textBytes("zss contents"));
  });

  it("does not call the WASM bridge with the optional .cmd/.zss bytes — they are never parsed by this item", async () => {
    const slots: CompleteFileSlots = {
      ...requiredOnlySlots(),
      // Deliberately not valid .cmd/.zss syntax at all — if these were fed
      // to the WASM bridge's load() call (which only accepts 4 arguments),
      // the call itself would need to change; success here proves they
      // aren't touched by the bridge.
      cmd: fileFromBytes("ryu.cmd", textBytes("not real cmd syntax")),
      zss: fileFromBytes("ryu.zss", textBytes("not real zss syntax")),
    };

    const result = await loadCharacterFromSlots(slots, testOptions);

    expect(result.status).toBe("success");
  });

  it("returns a read-error naming the offending required file when one cannot be read as bytes", async () => {
    const slots = requiredOnlySlots();
    const optionsWithFailingSff: CharacterFileInputOptions = {
      ...testOptions,
      readFileBytes: async (file) => {
        if (file.name === "ryu.sff") {
          throw new Error("simulated unreadable file");
        }
        return readFileAsBytes(file);
      },
    };

    const result = await loadCharacterFromSlots(slots, optionsWithFailingSff);

    expect(result.status).toBe("read-error");
    if (result.status !== "read-error") throw new Error("expected read-error");
    expect(result.error.kind).toBe("sff");
    expect(result.error.fileName).toBe("ryu.sff");
    expect(result.error.message).toContain("simulated unreadable file");
  });

  it("returns a read-error naming an unreadable optional file too, even though it's not WASM-parsed", async () => {
    const slots: CompleteFileSlots = {
      ...requiredOnlySlots(),
      cmd: fileFromBytes("ryu.cmd", textBytes("cmd contents")),
    };
    const optionsWithFailingCmd: CharacterFileInputOptions = {
      ...testOptions,
      readFileBytes: async (file) => {
        if (file.name === "ryu.cmd") {
          throw new Error("simulated unreadable optional file");
        }
        return readFileAsBytes(file);
      },
    };

    const result = await loadCharacterFromSlots(slots, optionsWithFailingCmd);

    expect(result.status).toBe("read-error");
    if (result.status !== "read-error") throw new Error("expected read-error");
    expect(result.error.kind).toBe("cmd");
  });

  it("returns a bridge-error with the module's message when a required file's contents are malformed", async () => {
    const slots = requiredOnlySlots();
    slots.sff = fileFromBytes(
      "ryu.sff",
      textBytes("this is not a valid .sff file"),
    );

    const result = await loadCharacterFromSlots(slots, testOptions);

    expect(result.status).toBe("bridge-error");
    if (result.status !== "bridge-error")
      throw new Error("expected bridge-error");
    expect(result.message).toContain("sprite");
  });
});
