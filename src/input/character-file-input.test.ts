import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import {
  type CharacterFileInputOptions,
  loadCharacterFromChosenDef,
  loadCharacterFromFolderFiles,
  readFileAsBytes,
  resolveDefCandidates,
  resolveReferencedFile,
  resolveZssFile,
  unsupportedSffVersion,
} from "./character-file-input.ts";
import type { GatheredFile } from "./folder-entries.ts";

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
function fixtureText(name: string): string {
  return readFileSync(path.join(testdataDir, name), "utf-8");
}
function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

function fileFromBytes(name: string, bytes: Uint8Array): File {
  return new File([bytes as BufferSource], name);
}

function gathered(
  relativePath: string,
  bytes: Uint8Array | string,
): GatheredFile {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  const fileBytes = typeof bytes === "string" ? textBytes(bytes) : bytes;
  return { file: fileFromBytes(name, fileBytes), relativePath };
}

beforeEach(() => {
  resetWasmBridgeForTests();
});

describe("resolveDefCandidates", () => {
  it("returns no-files for an empty folder", () => {
    expect(resolveDefCandidates([])).toEqual({ status: "no-files" });
  });

  it("returns no-candidate when nothing in the folder ends with .def", () => {
    const files = [gathered("readme.txt", "notes"), gathered("ryu.sff", "sff")];
    expect(resolveDefCandidates(files)).toEqual({ status: "no-candidate" });
  });

  it("auto-selects the single .def file found, case-insensitively", () => {
    const def = gathered("chars/ryu/Ryu.DEF", "[Files]\n");
    const files = [gathered("chars/ryu/ryu.sff", "sff"), def];

    expect(resolveDefCandidates(files)).toEqual({
      status: "success",
      entry: def,
    });
  });

  it("asks for a choice when more than one .def file is found", () => {
    const defA = gathered("ryu/ryu.def", "a");
    const defB = gathered("ken/ken.def", "b");

    const result = resolveDefCandidates([defA, defB]);

    expect(result).toEqual({
      status: "needs-selection",
      candidates: [defA, defB],
    });
  });
});

describe("resolveReferencedFile", () => {
  it("reports no-reference for a blank/whitespace-only referenced path", () => {
    expect(resolveReferencedFile("  ", [])).toEqual({ status: "no-reference" });
  });

  it("resolves an exact-case basename match, ignoring the reference's own subfolder", () => {
    const sff = gathered("sprites/kfm.sff", "sff-bytes");
    const result = resolveReferencedFile("kfm.sff", [sff]);
    expect(result).toEqual({ status: "success", entry: sff });
  });

  it("falls back to a case-insensitive basename match when no exact-case match exists", () => {
    const sff = gathered("sprites/KFM.SFF", "sff-bytes");
    const result = resolveReferencedFile("kfm.sff", [sff]);
    expect(result).toEqual({ status: "success", entry: sff });
  });

  it("reports not-found, naming the referenced filename, when nothing in the folder matches", () => {
    const result = resolveReferencedFile("kfm.sff", [
      gathered("other.sff", "x"),
    ]);
    expect(result).toEqual({ status: "not-found", referencedName: "kfm.sff" });
  });

  it("reports ambiguous, listing every candidate, when more than one file shares the exact basename", () => {
    const a = gathered("a/kfm.sff", "1");
    const b = gathered("b/kfm.sff", "2");
    const result = resolveReferencedFile("kfm.sff", [a, b]);
    expect(result).toEqual({
      status: "ambiguous",
      referencedName: "kfm.sff",
      candidates: [a, b],
    });
  });
});

describe("resolveZssFile", () => {
  it("reports none when the folder has no .zss file", () => {
    expect(resolveZssFile([gathered("ryu.def", "d")])).toEqual({
      status: "none",
    });
  });

  it("resolves the single .zss file found, since a .def never references one by name", () => {
    const zss = gathered("ryu.zss", "z");
    expect(resolveZssFile([gathered("ryu.def", "d"), zss])).toEqual({
      status: "success",
      entry: zss,
    });
  });

  it("reports ambiguous, listing both, when the folder has more than one .zss file", () => {
    const a = gathered("a.zss", "1");
    const b = gathered("b.zss", "2");
    expect(resolveZssFile([a, b])).toEqual({
      status: "ambiguous",
      candidates: [a, b],
    });
  });
});

describe("loadCharacterFromChosenDef / loadCharacterFromFolderFiles", () => {
  function defText(extra = ""): string {
    return `[Info]\nname = File Input Test Character\n\n[Files]\nsprite = ryu.sff\nanim = ryu.air\ncns = ryu.cns\n${extra}`;
  }

  function completeFolder(extra: GatheredFile[] = []): GatheredFile[] {
    return [
      gathered("ryu/ryu.def", defText()),
      gathered("ryu/ryu.air", fixtureBytes("sample.air")),
      gathered("ryu/ryu.sff", fixtureBytes("v1-basic.sff")),
      gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
      ...extra,
    ];
  }

  describe("optional sound file (.snd)", () => {
    const sndRef = "sound = ryu.snd\n";
    function folderWithSnd(bytes: Uint8Array | null, ref = sndRef) {
      return [
        gathered("ryu/ryu.def", defText(ref)),
        gathered("ryu/ryu.air", fixtureBytes("sample.air")),
        gathered("ryu/ryu.sff", fixtureBytes("v1-basic.sff")),
        gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
        ...(bytes ? [gathered("ryu/ryu.snd", bytes)] : []),
      ];
    }

    it("decodes the referenced .snd and keeps its raw bytes", async () => {
      const result = await loadCharacterFromFolderFiles(
        folderWithSnd(fixtureBytes("sample.snd")),
        testOptions,
      );
      if (result.status !== "success") throw new Error("expected success");
      expect(result.character.sounds?.map((g) => g.index)).toEqual([0, 5]);
      expect(result.character.sounds?.[0].sounds).toHaveLength(2);
      expect(result.files.snd).toBeDefined();
      expect(result.files.sndIssue).toBeUndefined();
    });

    it("loads with no sounds and no issue when the .def references no .snd", async () => {
      const result = await loadCharacterFromFolderFiles(
        folderWithSnd(null, ""),
        testOptions,
      );
      if (result.status !== "success") throw new Error("expected success");
      expect(result.character.sounds ?? []).toEqual([]);
      expect(result.files.snd).toBeUndefined();
      expect(result.files.sndIssue).toBeUndefined();
    });

    it("still loads the character, reporting the file name, when the referenced .snd is missing", async () => {
      const result = await loadCharacterFromFolderFiles(
        folderWithSnd(null),
        testOptions,
      );
      if (result.status !== "success") throw new Error("expected success");
      expect(result.character.animations).toHaveLength(2);
      expect(result.files.sndIssue).toContain("ryu.snd");
    });

    it("keeps the good sounds and flags the broken one when a single sound cannot be decoded", async () => {
      const result = await loadCharacterFromFolderFiles(
        folderWithSnd(fixtureBytes("partial.snd")),
        testOptions,
      );
      if (result.status !== "success") throw new Error("expected success");
      const group0 = result.character.sounds?.[0].sounds ?? [];
      expect(group0[0].error).toBeUndefined();
      expect(group0[1].error).toContain("sample 1");
      expect(result.files.sndIssue).toBeUndefined();
    });

    it("still loads the character, with the reason, when the whole .snd is invalid", async () => {
      const result = await loadCharacterFromFolderFiles(
        folderWithSnd(textBytes("definitely not a sound file")),
        testOptions,
      );
      if (result.status !== "success") throw new Error("expected success");
      expect(result.character.animations).toHaveLength(2);
      expect(result.files.sndIssue).toContain("ryu.snd");
    });
  });

  it("loads the character when exactly one .def is found and every required reference resolves", async () => {
    const result = await loadCharacterFromFolderFiles(
      completeFolder(),
      testOptions,
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.character.name).toBe("File Input Test Character");
    expect(result.character.animations).toHaveLength(2);
    expect(result.files.cmd).toBeUndefined();
    expect(result.files.zss).toBeUndefined();
  });

  it("resolves a referenced file that sits in a different subfolder than the .def itself", async () => {
    const files = [
      gathered("pack/ryu.def", defText()),
      gathered("pack/sprites/ryu.sff", fixtureBytes("v1-basic.sff")),
      gathered("pack/anims/ryu.air", fixtureBytes("sample.air")),
      gathered("pack/logic/ryu.cns", fixtureBytes("sample.cns")),
    ];

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result.status).toBe("success");
  });

  it("also resolves and reads the optional .cmd file when the .def references one", async () => {
    const files = completeFolder([
      gathered("ryu/ryu.cmd", fixtureText("sample.cmd")),
    ]);
    const withCmdRef = [
      gathered("ryu/ryu.def", defText("cmd = ryu.cmd\n")),
      ...files.slice(1),
    ];

    const result = await loadCharacterFromFolderFiles(withCmdRef, testOptions);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.files.cmd).toEqual(textBytes(fixtureText("sample.cmd")));
  });

  it("resolves a single .zss file by extension and includes its bytes, without blocking on ambiguity rules meant for referenced kinds", async () => {
    const files = completeFolder([gathered("ryu/ryu.zss", "zss contents")]);

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.files.zss).toEqual(textBytes("zss contents"));
  });

  it("still succeeds, flagging the count, when more than one .zss file is found (optional kind, never blocking)", async () => {
    const files = completeFolder([
      gathered("ryu/ryu.zss", "1"),
      gathered("ryu/ryu-alt.zss", "2"),
    ]);

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.zssAmbiguousCount).toBe(2);
    expect(result.files.zss).toBeUndefined();
  });

  it("prompts for a choice, without reading anything, when the folder has two .def files", async () => {
    const defA = gathered("ryu/ryu.def", defText());
    const defB = gathered("ken/ken.def", defText());

    const result = await loadCharacterFromFolderFiles(
      [defA, defB],
      testOptions,
    );

    expect(result).toEqual({
      status: "needs-selection",
      candidates: [defA, defB],
    });
  });

  it("reports no-candidate when the folder has no .def file at all", async () => {
    const result = await loadCharacterFromFolderFiles(
      [gathered("ryu.sff", "x")],
      testOptions,
    );
    expect(result).toEqual({ status: "no-candidate" });
  });

  it("reports reference-not-found, naming the exact missing filename, when a required reference can't be located anywhere", async () => {
    const files = [
      gathered("ryu/ryu.def", defText()),
      gathered("ryu/ryu.air", fixtureBytes("sample.air")),
      // .sff deliberately missing
      gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
    ];

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result).toEqual({
      status: "reference-not-found",
      kind: "sff",
      referencedName: "ryu.sff",
    });
  });

  it("reports reference-ambiguous, naming the reference and listing candidates, when two files share the referenced basename", async () => {
    const sffA = gathered("a/ryu.sff", fixtureBytes("v1-basic.sff"));
    const sffB = gathered("b/ryu.sff", fixtureBytes("v1-basic.sff"));
    const files = [
      gathered("ryu/ryu.def", defText()),
      gathered("ryu/ryu.air", fixtureBytes("sample.air")),
      sffA,
      sffB,
      gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
    ];

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result).toEqual({
      status: "reference-ambiguous",
      kind: "sff",
      referencedName: "ryu.sff",
      candidates: [sffA, sffB],
    });
  });

  it("reports reference-not-found for the referenced .cmd file when the .def names one but it's missing", async () => {
    const files = [
      gathered("ryu/ryu.def", defText("cmd = ryu.cmd\n")),
      gathered("ryu/ryu.air", fixtureBytes("sample.air")),
      gathered("ryu/ryu.sff", fixtureBytes("v1-basic.sff")),
      gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
    ];

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result).toEqual({
      status: "reference-not-found",
      kind: "cmd",
      referencedName: "ryu.cmd",
    });
  });

  it("returns a read-error naming the offending file when a resolved required file cannot be read", async () => {
    const options: CharacterFileInputOptions = {
      ...testOptions,
      readFileBytes: async (file) => {
        if (file.name === "ryu.sff")
          throw new Error("simulated unreadable file");
        return readFileAsBytes(file);
      },
    };

    const result = await loadCharacterFromFolderFiles(
      completeFolder(),
      options,
    );

    expect(result.status).toBe("read-error");
    if (result.status !== "read-error") throw new Error("expected read-error");
    expect(result.error.kind).toBe("sff");
    expect(result.error.fileName).toBe("ryu.sff");
    expect(result.error.message).toContain("simulated unreadable file");
  });

  it("returns a bridge-error with the module's message when the resolved files' contents are malformed", async () => {
    const files = [
      gathered("ryu/ryu.def", defText()),
      gathered("ryu/ryu.air", fixtureBytes("sample.air")),
      gathered("ryu/ryu.sff", "not a valid sff file"),
      gathered("ryu/ryu.cns", fixtureBytes("sample.cns")),
    ];

    const result = await loadCharacterFromFolderFiles(files, testOptions);

    expect(result.status).toBe("bridge-error");
    if (result.status !== "bridge-error")
      throw new Error("expected bridge-error");
    expect(result.message).toContain("sprite");
  });

  it("loadCharacterFromChosenDef loads directly from an already-chosen .def entry, for the multi-def picker flow", async () => {
    const folder = completeFolder();
    const chosen = folder[0];

    const result = await loadCharacterFromChosenDef(
      chosen,
      folder,
      testOptions,
    );

    expect(result.status).toBe("success");
  });

  describe("robust loading (flow 002)", () => {
    it("reports each named step in order, with the file count", async () => {
      const steps: string[] = [];
      await loadCharacterFromFolderFiles(completeFolder(), {
        ...testOptions,
        onProgress: (progress) =>
          steps.push(
            progress.step === "files" && progress.total !== undefined
              ? `files ${progress.done}/${progress.total}`
              : progress.step,
          ),
      });
      expect(steps[0]).toBe("definition");
      expect(steps).toContain("files 0/3");
      expect(steps).toContain("files 3/3");
      expect(steps.slice(-2)).toEqual(["engine", "open"]);
    });

    it("returns cancelled, and never reaches the engine, when aborted during a read", async () => {
      const controller = new AbortController();
      let engineReached = false;
      const result = await loadCharacterFromFolderFiles(completeFolder(), {
        ...testOptions,
        signal: controller.signal,
        readFileBytes: async (file) => {
          controller.abort();
          return readFileAsBytes(file);
        },
        onProgress: (progress) => {
          if (progress.step === "engine") engineReached = true;
        },
      });
      expect(result.status).toBe("cancelled");
      expect(engineReached).toBe(false);
    });

    it("returns cancelled when aborted while the engine parses", async () => {
      const controller = new AbortController();
      const result = await loadCharacterFromFolderFiles(completeFolder(), {
        ...testOptions,
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.step === "engine") controller.abort();
        },
      });
      expect(result.status).toBe("cancelled");
    });

    it("opens with a stand-in sprite sheet and lists the unreadable one", async () => {
      const result = await loadCharacterFromFolderFiles(completeFolder(), {
        ...testOptions,
        readFileBytes: async (file) => {
          if (file.name.endsWith(".sff")) throw new Error("NotReadableError");
          return readFileAsBytes(file);
        },
        fetchBlankSffBytes: async () => fixtureBytes("v1-basic.sff"),
      });
      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error("expected success");
      expect(result.unreadable).toEqual([
        { kind: "sff", fileName: "ryu.sff", detail: "NotReadableError" },
      ]);
    });

    it("still fails with a read error when the stand-in sprite sheet cannot be fetched either", async () => {
      const result = await loadCharacterFromFolderFiles(completeFolder(), {
        ...testOptions,
        readFileBytes: async (file) => {
          if (file.name.endsWith(".sff")) throw new Error("NotReadableError");
          return readFileAsBytes(file);
        },
        fetchBlankSffBytes: async () => {
          throw new Error("offline");
        },
      });
      expect(result.status).toBe("read-error");
    });

    it("fails with a read error when an animation or constants file is unreadable", async () => {
      for (const extension of [".air", ".cns"]) {
        const result = await loadCharacterFromFolderFiles(completeFolder(), {
          ...testOptions,
          readFileBytes: async (file) => {
            if (file.name.endsWith(extension)) throw new Error("denied");
            return readFileAsBytes(file);
          },
        });
        expect(result.status, extension).toBe("read-error");
      }
    });

    it("opens without an unreadable optional .cmd and lists it", async () => {
      const folder = [
        gathered("ryu/ryu.def", `${defText()}cmd = ryu.cmd\n`),
        ...completeFolder().slice(1),
        gathered("ryu/ryu.cmd", fixtureBytes("sample.cmd")),
      ];
      const result = await loadCharacterFromFolderFiles(folder, {
        ...testOptions,
        readFileBytes: async (file) => {
          if (file.name.endsWith(".cmd")) throw new Error("denied");
          return readFileAsBytes(file);
        },
      });
      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error("expected success");
      expect(result.unreadable?.map((file) => file.kind)).toEqual(["cmd"]);
      expect(result.files.cmd).toBeUndefined();
    });

    it("rejects a sprite sheet whose major version the editor cannot open", async () => {
      const newer = new Uint8Array(fixtureBytes("v1-basic.sff"));
      newer[15] = 3;
      const result = await loadCharacterFromFolderFiles(
        completeFolder().map((entry) =>
          entry.file.name.endsWith(".sff")
            ? gathered("ryu/ryu.sff", newer)
            : entry,
        ),
        testOptions,
      );
      expect(result).toEqual({
        status: "unsupported-version",
        fileName: "ryu.sff",
        version: "3.0.1.0",
        supported: "1 – 2",
      });
    });
  });

  describe("unsupportedSffVersion", () => {
    it("accepts versions 1 and 2, and files that are not a sprite sheet", () => {
      const v1 = fixtureBytes("v1-basic.sff");
      expect(unsupportedSffVersion(v1)).toBeUndefined();
      const v2 = new Uint8Array(v1);
      v2[15] = 2;
      expect(unsupportedSffVersion(v2)).toBeUndefined();
      expect(
        unsupportedSffVersion(textBytes("not a sheet at all")),
      ).toBeUndefined();
      expect(unsupportedSffVersion(new Uint8Array(4))).toBeUndefined();
    });

    it("names the version of a header with another major version", () => {
      const newer = new Uint8Array(fixtureBytes("v1-basic.sff"));
      newer[15] = 0;
      expect(unsupportedSffVersion(newer)).toBe("0.0.1.0");
    });
  });
});
